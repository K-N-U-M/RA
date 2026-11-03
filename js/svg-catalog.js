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

  // ── 5. MINI-ICONOS VECTORIALES UI & PRESUPUESTOS (VIEWBOX 24×24) ──
  var MINI_PATHS = {
    bolt: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    wind: '<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
    fileText: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8M16 13H8M16 17H8"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/><path d="M5 3v4M3 5h4"/>',
    clipboard: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    errorCircle: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/>',
    leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
    tree: '<path d="M12 22v-7"/><path d="M7 15h10l-3-5h2l-4-6-4 6h2l-3 5Z"/>',
    chart: '<path d="M3 3v18h18"/><rect width="4" height="7" x="7" y="10" rx="1"/><rect width="4" height="12" x="15" y="5" rx="1"/>',
    trendUp: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
    building: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    store: '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/>',
    school: '<path d="m4 6 8-4 8 4"/><path d="m18 10 4 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8l4-2"/><path d="M14 22v-4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v4"/><path d="M18 5v17M6 5v17"/>',
    factory: '<path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M17 18h1M12 18h1M7 18h1"/>',
    gridPanel: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    battery: '<rect width="16" height="10" x="2" y="7" rx="2"/><line x1="22" x2="22" y1="11" y2="13"/><path d="M6 11v2M10 11v2M14 11v2"/>',
    plug: '<path d="M12 22v-5"/><path d="M9 8V2M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>',
    hardHat: '<path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M4 15v-3a6 6 0 0 1 6-6"/><path d="M14 6a6 6 0 0 1 6 6v3"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    puzzle: '<path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.315 8.685a.98.98 0 0 1 .837-.276c.47.07.802.48.968.925a2.501 2.501 0 1 0 3.214-3.214c-.446-.166-.855-.497-.925-.968a.979.979 0 0 1 .276-.837l1.61-1.61a2.404 2.404 0 0 1 1.705-.707c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z"/>',
    lightbulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6M10 22h4"/>',
    rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
    save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
    palette: '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
    type: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/>',
    sliders: '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/>',
    euro: '<path d="M4 10h12M4 14h9"/><path d="M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.8-.8 5.2-2"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    packageBox: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
    landmark: '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
    handshake: '<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3M3 4h8"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
    wand: '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/><path d="m14 7 3 3M5 6v4M19 14v4M10 2v2M7 8H3M21 16h-4M11 3H9"/>',
    layout: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M9 21V9"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    flask: '<path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7M7 16h10"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
    monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
    ruler: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2"/>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>'
  };

  function renderMiniSvg(name, size, color, extraStyle) {
    size = size || 14;
    color = color || 'currentColor';
    extraStyle = extraStyle || '';
    var p = MINI_PATHS[name] || MINI_PATHS.bolt;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-0.18em;flex-shrink:0;' + extraStyle + '">' + p + '</svg>';
  }

  /**
   * Helper unificado de renderizado de icono/ilustración
   * @param {string} name - Nombre de la ilustración (ej. 'panel', 'warranty25', 'billCut')
   * @param {string} [color] - Color CSS o hex (por defecto 'currentColor')
   * @param {number} [size] - Tamaño en píxeles (ancho y alto)
   * @param {string} [extraClass] - Clases CSS adicionales
   */
  function renderSvgIcon(name, color, size, extraClass) {
    if (SVG_CATALOG[name]) {
      var svg = SVG_CATALOG[name](color, size);
      if (extraClass) {
        svg = svg.replace('<svg ', '<svg class="' + extraClass + '" ');
      }
      return svg;
    }
    if (MINI_PATHS[name]) {
      return renderMiniSvg(name, size || 16, color || 'currentColor');
    }
    return '<span class="ra-svg-fallback" style="display:inline-block;width:' + (size||24) + 'px;height:' + (size||24) + 'px;"></span>';
  }

  // Exposición canónica global con alias de compatibilidad
  global.RA_SvgCatalog = {
    render: renderSvgIcon,
    mini: renderMiniSvg,
    get: function(name, opts) {
      opts = opts || {};
      return renderSvgIcon(name, opts.color || opts.fill, opts.size || opts.width || 36, opts.className || opts.extraClass);
    },
    icons: SVG_CATALOG,
    miniPaths: MINI_PATHS
  };
  global.RASvgCatalog = global.RA_SvgCatalog;
  if (global.RA) {
    global.RA.SvgCatalog = global.RA_SvgCatalog;
    global.RA.RASvgCatalog = global.RA_SvgCatalog;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
