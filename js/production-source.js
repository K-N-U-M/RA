/**
 * ============================================================================
 * 🛰️ RA · FUENTE DE PRODUCCIÓN CANÓNICA
 * ============================================================================
 * Archivo: js/production-source.js
 * Rol: resolver el kWh/año canónico con prioridad explícita y memoización:
 *   1) simulación por panel (`RA.solarStats`)      → 'simulation'
 *   2) motor físico con GHI del emplazamiento      → 'physical'
 *   3) tabla estacional interna                    → 'fallback-seasonal'
 *
 * [AUD-2026 · D-01/F-01] Antes esta lógica vivía dentro de `getProjectCalcs()`
 * (bloque inline de index.html). Se extrae para respetar la regla de congelación
 * del inline y poder probarla de forma aislada.
 * ============================================================================
 */
(function (root) {
  'use strict';

  var _cache = {};

  function signature(o) {
    return [
      o.kwp, o.lat, o.lon, o.tilt, o.azimuth,
      (o.cfg && o.cfg.modelo) || '',
      (o.cfg && o.cfg.potencia) || 0
    ].join('|');
  }

  /**
   * Resuelve la producción física con datos del emplazamiento.
   * @param {Object} o {kwp, lat, lon, tilt, azimuth, cfg}
   * @returns {{annualKWh:number, monthlyKWh:number[], source:string, detail:string}|null}
   */
  function computePhysical(o) {
    o = o || {};
    if (!(Number(o.kwp) > 0)) return null;
    var runner = (typeof root.runPhysicalModel === 'function') ? root.runPhysicalModel : null;
    if (!runner) return null;

    var sig = signature(o);
    if (_cache[sig]) return _cache[sig];

    var ph = runner(
      Number(o.kwp), Number(o.lat), Number(o.lon),
      Number(o.tilt), Number(o.azimuth), o.cfg || {}, null
    );
    if (!ph || !(ph.annualKWh > 0) || !Array.isArray(ph.monthlyKWh) || ph.monthlyKWh.length !== 12) {
      return null;
    }
    var res = {
      annualKWh: Number(ph.annualKWh),
      monthlyKWh: ph.monthlyKWh.slice(),
      source: 'physical',
      detail: 'Motor físico · ' + (ph.ghiSource || 'GHI del emplazamiento'),
      pr: ph.PR,
      prWarning: ph.prWarning || null
    };
    _cache[sig] = res;
    return res;
  }

  /**
   * Decide la fuente. Devuelve null si no hay simulación ni motor físico
   * (el llamador conserva su tabla estacional).
   */
  function resolve(o) {
    o = o || {};
    var stats = o.stats || null;
    if (stats && Number(stats.annualYieldKWh) > 0 && Number.isFinite(stats.annualYieldKWh)) {
      return {
        annualKWh: Number(stats.annualYieldKWh),
        monthlyKWh: Array.isArray(stats.monthlyYields) ? stats.monthlyYields.slice() : null,
        source: 'simulation',
        detail: 'Simulación por panel (sombras + pérdidas)'
      };
    }
    return computePhysical(o);
  }

  function clearCache() { _cache = {}; }

  var api = { computePhysical: computePhysical, resolve: resolve, clearCache: clearCache };
  if (!root.RA) root.RA = {};
  root.RA.Production = api;
  root.RAProduction = api;
})(typeof window !== 'undefined' ? window : this);
