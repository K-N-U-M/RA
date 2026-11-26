/**
 * js/ra-bootstrap.js
 * Bootstrap temprano del namespace global window.RA (SSOT de arranque).
 * Garantiza que window.RA y sus subespacios básicos existan antes de que
 * cualquier módulo (project-config, ui-viewport-controls, error-handler, etc.)
 * escriba en él, sin depender del orden de carga de scripts.
 */
(function (root) {
  'use strict';

  var ra = root.RA;
  if (!ra || typeof ra !== 'object') {
    ra = {};
    root.RA = ra;
  }

  if (!ra.version) ra.version = '2.0.0';
  if (!('projectConfig' in ra)) ra.projectConfig = null;
  if (!('inverterState' in ra)) ra.inverterState = null;
  if (!('wpState' in ra)) ra.wpState = null;
  if (!ra.ui || typeof ra.ui !== 'object') ra.ui = {};
  if (!('scene' in ra)) ra.scene = null;
  if (!('viewer' in ra)) ra.viewer = null;
  if (!ra.UI || typeof ra.UI !== 'object') ra.UI = {};
  if (!Array.isArray(ra._listeners)) ra._listeners = [];

  if (!ra.log || typeof ra.log !== 'object') {
    ra.log = {
      info: function () {
        if (typeof console !== 'undefined') console.log.apply(console, ['[RA]'].concat(Array.prototype.slice.call(arguments)));
      },
      debug: function () {
        if (ra.debug && typeof console !== 'undefined') console.log.apply(console, ['[RA]'].concat(Array.prototype.slice.call(arguments)));
      },
      warn: function () {
        if (ra.debug && typeof console !== 'undefined') console.warn.apply(console, ['[RA]'].concat(Array.prototype.slice.call(arguments)));
      },
      error: function () {
        if (typeof console !== 'undefined') console.error.apply(console, ['[RA ERROR]'].concat(Array.prototype.slice.call(arguments)));
      }
    };
  }

  if (typeof ra.addListener !== 'function') {
    ra.addListener = function (target, event, handler, options) {
      if (typeof target === 'string') {
        options = handler;
        handler = event;
        event = target;
        target = root;
      }
      if (target && typeof target.addEventListener === 'function') {
        target.addEventListener(event, handler, options);
        ra._listeners.push({ target: target, event: event, handler: handler });
      }
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ra;
  }
})(typeof window !== 'undefined' ? window : globalThis);
