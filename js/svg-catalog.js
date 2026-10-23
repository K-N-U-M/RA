/**
 * ============================================================================
 * 🎨 RA · CATÁLOGO DE ICONOGRAFÍA E ILUSTRACIONES SVG MONOCROMÁTICAS (SSOT)
 * ============================================================================
 * Librería vectorial pura en línea (sin dependencias externas ni imágenes raster).
 * Soporta tintado monocromático dinámico mediante 'currentColor' o color inyectado.
 * 
 * CATEGORÍAS:
 *   1. Equipos Principales: panel, inverter, battery, structure, protections, meter.
 *   2. Impacto Económico: billCut, piggyBank, freeEnergy, savingsChart, zeroEuro.
 *   3. Garantías & Confianza: warranty25, shieldCheck, certifiedEngineer, qualityStar.
 *   4. Ciclo Solar 24h: morningSun, peakSun, eveningMoon, energyFlow24h.
 * ============================================================================
 */
(function(global) {
  'use strict';

  var SVG_CATALOG = {
    // ── 1. EQUIPAMIENTO TÉCNICO PRINCIPAL ──
    panel: function(color, size) {
      color = color || 'currentColor';
      size = size || 40;
      return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="6" y="8" width="36" height="32" rx="3" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round"/>' +
        '<path d="M6 18H42M6 28H42" stroke="' + color + '" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M18 8V40M30 8V40" stroke="' + color + '" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M10 44L14 40M38 44L34 40" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"/>' +
      '</svg>';
    },

    inverter: function(color, size) {
      color = color || 'currentColor';
      size = size || 40;
      return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="10" y="6" width="28" height="36" rx="4" stroke="' + color + '" stroke-width="2.5"/>' +
        '<rect x="16" y="12" width="16" height="10" rx="2" stroke="' + color + '" stroke-width="2"/>' +
        '<path d="M20 17H28" stroke="' + color + '" stroke-width="2" stroke-linecap="round"/>' +
        '<circle cx="18" cy="28" r="2" fill="' + color + '"/>' +
        '<circle cx="24" cy="28" r="2" fill="' + color + '"/>' +
        '<circle cx="30" cy="28" r="2" fill="' + color + '"/>' +
        '<path d="M17 35C20 33 22 37 25 35C28 33 30 37 31 35" stroke="' + color + '" stroke-width="2" stroke-linecap="round"/>' +
      '</svg>';
    },

    battery: function(color, size) {
      color = color || 'currentColor';
      size = size || 40;
      return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="18" y="5" width="12" height="4" rx="1.5" stroke="' + color + '" stroke-width="2" fill="' + color + '" fill-opacity="0.2"/>' +
        '<rect x="10" y="9" width="28" height="34" rx="4" stroke="' + color + '" stroke-width="2.5"/>' +
        '<path d="M16 26L25 15V23H32L23 34V26H16Z" stroke="' + color + '" stroke-width="2" stroke-linejoin="round" fill="' + color + '" fill-opacity="0.15"/>' +
        '<line x1="16" y1="38" x2="32" y2="38" stroke="' + color + '" stroke-width="2" stroke-linecap="round"/>' +
      '</svg>';
    },

    protections: function(color, size) {
      color = color || 'currentColor';
      size = size || 40;
      return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="8" y="8" width="32" height="32" rx="3" stroke="' + color + '" stroke-width="2.5"/>' +
        '<rect x="13" y="14" width="9" height="14" rx="1.5" stroke="' + color + '" stroke-width="2"/>' +
        '<rect x="26" y="14" width="9" height="14" rx="1.5" stroke="' + color + '" stroke-width="2"/>' +
        '<line x1="17.5" y1="21" x2="17.5" y2="25" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"/>' +
        '<line x1="30.5" y1="17" x2="30.5" y2="21" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"/>' +
        '<circle cx="24" cy="34" r="2" fill="' + color + '"/>' +
      '</svg>';
    },

    structure: function(color, size) {
      color = color || 'currentColor';
      size = size || 40;
      return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<line x1="6" y1="38" x2="42" y2="38" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"/>' +
        '<path d="M10 38L38 18M38 18V38M24 28V38" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round"/>' +
        '<rect x="8" y="14" width="32" height="8" rx="1.5" transform="rotate(-15 8 14)" stroke="' + color + '" stroke-width="2" fill="' + color + '" fill-opacity="0.15"/>' +
      '</svg>';
    },

    meter: function(color, size) {
      color = color || 'currentColor';
      size = size || 40;
      return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="24" cy="24" r="18" stroke="' + color + '" stroke-width="2.5"/>' +
        '<path d="M12 28C14 20 18 16 24 16C30 16 34 20 36 28" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-dasharray="2 3"/>' +
        '<circle cx="24" cy="27" r="3" fill="' + color + '"/>' +
        '<line x1="24" y1="27" x2="31" y2="18" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"/>' +
        '<rect x="18" y="33" width="12" height="5" rx="1" stroke="' + color + '" stroke-width="1.5"/>' +
      '</svg>';
    },

    // ── 2. IMPACTO ECONÓMICO Y BOLSILLO ──
    billCut: function(color, size) {
      color = color || 'currentColor';
      size = size || 40;
      return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M12 6H36V42L30 38L24 42L18 38L12 42V6Z" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round"/>' +
        '<path d="M18 14H30M18 20H26" stroke="' + color + '" stroke-width="2" stroke-linecap="round"/>' +
        '<circle cx="34" cy="28" r="8" fill="#ffffff" stroke="' + color + '" stroke-width="2"/>' +
        '<path d="M30 32L38 24M30 24L38 32" stroke="' + color + '" stroke-width="2" stroke-linecap="round"/>' +
      '</svg>';
    },

    piggyBank: function(color, size) {
      color = color || 'currentColor';
      size = size || 40;
      return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M37 20C37 15.5 32 11 25 11C18 11 11 16 11 23C11 26 12.5 28.5 15 30.5V36L20 34C21.5 34.5 23.2 35 25 35C32 35 37 30 37 24V20Z" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round"/>' +
        '<line x1="22" y1="16" x2="28" y2="16" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"/>' +
        '<circle cx="18" cy="20" r="1.5" fill="' + color + '"/>' +
        '<path d="M37 22H42V28H37" stroke="' + color + '" stroke-width="2" stroke-linejoin="round"/>' +
        '<line x1="30" y1="34" x2="32" y2="38" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"/>' +
      '</svg>';
    },

    freeEnergy: function(color, size) {
      color = color || 'currentColor';
      size = size || 40;
      return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="24" cy="24" r="19" stroke="' + color + '" stroke-width="2.5"/>' +
        '<path d="M22 13L15 25H23L21 35L33 21H25L27 13H22Z" fill="' + color + '" stroke="' + color + '" stroke-width="1.5" stroke-linejoin="round"/>' +
      '</svg>';
    },

    savingsChart: function(color, size) {
      color = color || 'currentColor';
      size = size || 40;
      return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M8 40H40" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"/>' +
        '<rect x="12" y="26" width="6" height="14" rx="1.5" stroke="' + color + '" stroke-width="2" fill="' + color + '" fill-opacity="0.15"/>' +
        '<rect x="21" y="18" width="6" height="22" rx="1.5" stroke="' + color + '" stroke-width="2" fill="' + color + '" fill-opacity="0.3"/>' +
        '<rect x="30" y="10" width="6" height="30" rx="1.5" stroke="' + color + '" stroke-width="2" fill="' + color + '" fill-opacity="0.5"/>' +
        '<path d="M12 20L22 12L31 16L39 8" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M33 8H39V14" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
    },

    zeroEuro: function(color, size) {
      color = color || 'currentColor';
      size = size || 40;
      return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="24" cy="24" r="18" stroke="' + color + '" stroke-width="2.5"/>' +
        '<path d="M30 17C28 15 25 15 23 15C18.5 15 15 19 15 24C15 29 18.5 33 23 33C25 33 28 33 30 31" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"/>' +
        '<line x1="12" y1="21" x2="26" y2="21" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"/>' +
        '<line x1="12" y1="27" x2="26" y2="27" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"/>' +
      '</svg>';
    },

    // ── 3. GARANTÍAS Y SELLOS DE CONFIANZA ──
    warranty25: function(color, size) {
      color = color || 'currentColor';
      size = size || 40;
      return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M24 4L38 9V21C38 31 31 39 24 43C17 39 10 31 10 21V9L24 4Z" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round" fill="' + color + '" fill-opacity="0.08"/>' +
        '<text x="24" y="24" text-anchor="middle" font-size="13" font-weight="900" font-family="system-ui, sans-serif" fill="' + color + '">25</text>' +
        '<text x="24" y="32" text-anchor="middle" font-size="8" font-weight="800" font-family="system-ui, sans-serif" fill="' + color + '">AÑOS</text>' +
      '</svg>';
    },

    shieldCheck: function(color, size) {
      color = color || 'currentColor';
      size = size || 40;
      return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M24 4L38 9V21C38 31 31 39 24 43C17 39 10 31 10 21V9L24 4Z" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round"/>' +
        '<path d="M17 22L22 27L32 16" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
    },

    certifiedEngineer: function(color, size) {
      color = color || 'currentColor';
      size = size || 40;
      return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="8" y="6" width="32" height="36" rx="3" stroke="' + color + '" stroke-width="2.5"/>' +
        '<path d="M14 14H34M14 20H26" stroke="' + color + '" stroke-width="2" stroke-linecap="round"/>' +
        '<circle cx="28" cy="29" r="6" stroke="' + color + '" stroke-width="2" fill="' + color + '" fill-opacity="0.15"/>' +
        '<path d="M25 34L23 40L28 38L33 40L31 34" stroke="' + color + '" stroke-width="2" stroke-linejoin="round"/>' +
      '</svg>';
    },

    qualityStar: function(color, size) {
      color = color || 'currentColor';
      size = size || 40;
      return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="24" cy="24" r="18" stroke="' + color + '" stroke-width="2.5"/>' +
        '<path d="M24 12L27.5 19.5L35.5 20.5L29.5 26L31 34L24 30L17 34L18.5 26L12.5 20.5L20.5 19.5L24 12Z" stroke="' + color + '" stroke-width="2" fill="' + color + '" fill-opacity="0.2" stroke-linejoin="round"/>' +
      '</svg>';
    },

    // ── 4. CICLO SOLAR 24 HORAS ──
    morningSun: function(color, size) {
      color = color || 'currentColor';
      size = size || 40;
      return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<line x1="6" y1="34" x2="42" y2="34" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"/>' +
        '<path d="M16 34C16 29.5 19.5 26 24 26C28.5 26 32 29.5 32 34" stroke="' + color + '" stroke-width="2.5"/>' +
        '<line x1="24" y1="18" x2="24" y2="22" stroke="' + color + '" stroke-width="2" stroke-linecap="round"/>' +
        '<line x1="14" y1="24" x2="17" y2="26" stroke="' + color + '" stroke-width="2" stroke-linecap="round"/>' +
        '<line x1="34" y1="24" x2="31" y2="26" stroke="' + color + '" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M24 10L27 13M24 10L21 13M24 10V18" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
    },

    peakSun: function(color, size) {
      color = color || 'currentColor';
      size = size || 40;
      return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="24" cy="24" r="9" stroke="' + color + '" stroke-width="2.5" fill="' + color + '" fill-opacity="0.15"/>' +
        '<line x1="24" y1="6" x2="24" y2="11" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"/>' +
        '<line x1="24" y1="37" x2="24" y2="42" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"/>' +
        '<line x1="6" y1="24" x2="11" y2="24" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"/>' +
        '<line x1="37" y1="24" x2="42" y2="24" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"/>' +
        '<line x1="11.5" y1="11.5" x2="15" y2="15" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"/>' +
        '<line x1="33" y1="33" x2="36.5" y2="36.5" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"/>' +
        '<line x1="11.5" y1="36.5" x2="15" y2="33" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"/>' +
        '<line x1="33" y1="15" x2="36.5" y2="11.5" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"/>' +
      '</svg>';
    },

    eveningMoon: function(color, size) {
      color = color || 'currentColor';
      size = size || 40;
      return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M30 10C21.5 11 15 18 15 26.5C15 35 22 42 30.5 42C33.5 42 36 41 38 39.5C31.5 38 26.5 32 26.5 25C26.5 18 31 12 37.5 10.5C35 10 32.5 10 30 10Z" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round" fill="' + color + '" fill-opacity="0.15"/>' +
        '<circle cx="36" cy="18" r="1.5" fill="' + color + '"/>' +
        '<circle cx="31" cy="25" r="1.5" fill="' + color + '"/>' +
        '<circle cx="24" cy="33" r="1.5" fill="' + color + '"/>' +
      '</svg>';
    },

    energyFlow24h: function(color, size) {
      color = color || 'currentColor';
      size = size || 48;
      return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="24" cy="24" r="18" stroke="' + color + '" stroke-width="2" stroke-dasharray="4 3"/>' +
        '<circle cx="24" cy="10" r="4" stroke="' + color + '" stroke-width="2" fill="' + color + '"/>' +
        '<rect x="34" y="21" width="7" height="6" rx="1.5" stroke="' + color + '" stroke-width="2"/>' +
        '<path d="M21 35L24 32L27 35V40H21V35Z" stroke="' + color + '" stroke-width="2"/>' +
        '<path d="M7 21L10 24L13 21" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
    }
  };

  /**
   * Helper unificado de renderizado de icono/ilustración
   * @param {string} name - Nombre de la ilustración (ej. 'panel', 'warranty25', 'billCut')
   * @param {string} [color] - Color CSS o hex (por defecto 'currentColor')
   * @param {number} [size] - Tamaño en píxeles (ancho y alto)
   * @param {string} [extraClass] - Clases CSS adicionales
   */
  function renderSvgIcon(name, color, size, extraClass) {
    if (!SVG_CATALOG[name]) {
      return '<span class="ra-svg-fallback" style="display:inline-block;width:' + (size||24) + 'px;height:' + (size||24) + 'px;"></span>';
    }
    var svg = SVG_CATALOG[name](color, size);
    if (extraClass) {
      svg = svg.replace('<svg ', '<svg class="' + extraClass + '" ');
    }
    return svg;
  }

  // Exposición canónica global con alias de compatibilidad
  global.RA_SvgCatalog = {
    render: renderSvgIcon,
    get: function(name, opts) {
      opts = opts || {};
      return renderSvgIcon(name, opts.color || opts.fill, opts.size || opts.width || 36, opts.className || opts.extraClass);
    },
    icons: SVG_CATALOG
  };
  global.RASvgCatalog = global.RA_SvgCatalog;
  if (global.RA) {
    global.RA.SvgCatalog = global.RA_SvgCatalog;
    global.RA.RASvgCatalog = global.RA_SvgCatalog;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
