/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RA — Parser Canónico WAsP (.lib / GWC) y Función Gamma de Lanczos (UMD)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Fuente única de verdad (SSOT) compartida entre:
 *   - Cliente navegador (js/wind/wind-resource.js)
 *   - Servidor local de desarrollo (server.js)
 *   - Firebase Cloud Function (functions/wasp-parser.js — copia sincronizada)
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === 'object') {
    root.RAWind = root.RAWind || {};
    root.RAWind.WAsP = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  /**
   * Aproximación numérica de la función Gamma Γ(z) (fórmula de Lanczos, g=7).
   * Usada para calcular el parámetro de escala Weibull c = vMean / Γ(1 + 1/k).
   * @param {number} z
   * @returns {number}
   */
  function lanczosGamma(z) {
    if (!Number.isFinite(z) || z <= 0) return 1.0;
    var g = 7;
    var p = [
      0.99999999999980993,
      676.5209681287051,
      -1259.1392167224028,
      771.32342877765313,
      -176.61502916214059,
      12.507343278686905,
      -0.13857109583659912,
      9.9843695780195716e-6,
      1.5056327351493116e-7
    ];
    if (z < 0.5) {
      return Math.PI / (Math.sin(Math.PI * z) * lanczosGamma(1 - z));
    }
    z -= 1;
    var x = p[0];
    for (var i = 1; i < g + 2; i++) {
      x += p[i] / (z + i);
    }
    var t = z + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
  }

  /**
   * Parser estricto de archivos de clima eólico generalizado WAsP (.lib / GWC)
   * del Global Wind Atlas 3.0 (DTU Wind Energy / World Bank).
   * Incluye validaciones estrictas de límites de cabecera, integridad de filas,
   * finitud numérica y presencia de alturas de referencia 10m / 50m.
   * @param {string} libText
   * @returns {Object}
   */
  function parseWAsPLib(libText) {
    if (typeof libText !== 'string' || libText.trim().length === 0) {
      throw new Error('Archivo .lib vacío o inválido');
    }
    var lines = libText.trim().split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l.length > 0; });
    if (lines.length < 5) {
      throw new Error('Formato .lib de WAsP inválido o truncado');
    }

    var header = lines[0];
    var coordMatch = header.match(/<coordinates>([0-9.-]+),([0-9.-]+)/);
    var lon = coordMatch ? parseFloat(coordMatch[1]) : 0;
    var lat = coordMatch ? parseFloat(coordMatch[2]) : 0;

    var parts2 = lines[1].split(/\s+/).map(Number);
    var numRough = parts2[0];
    var numHeights = parts2[1];
    var numSectors = parts2[2];

    var isInt = function (v, lo, hi) {
      return Number.isInteger(v) && v >= lo && v <= hi;
    };
    if (!isInt(numRough, 1, 8) || !isInt(numHeights, 1, 12) || !isInt(numSectors, 1, 36)) {
      throw new Error('Cabecera .lib fuera de rango (rough/heights/sectors)');
    }
    var needed = 4 + numRough * (1 + numHeights * 2);
    if (lines.length < needed) {
      throw new Error('Fichero .lib truncado');
    }

    var roughnesses = lines[2].split(/\s+/).map(Number);
    var heights = lines[3].split(/\s+/).map(Number);
    if (roughnesses.length < numRough || heights.length < numHeights) {
      throw new Error('Cabecera .lib con rugosidades o alturas incompletas');
    }

    var curLine = 4;
    var roughnessBlocks = [];
    for (var r = 0; r < numRough; r++) {
      var freqs = lines[curLine++].split(/\s+/).map(Number);
      if (freqs.length < numSectors) {
        throw new Error('Frecuencias .lib incompletas');
      }
      var heightData = [];
      for (var h = 0; h < numHeights; h++) {
        var A = lines[curLine++].split(/\s+/).map(Number);
        var k = lines[curLine++].split(/\s+/).map(Number);
        if (A.length < numSectors || k.length < numSectors) {
          throw new Error('Sectores Weibull .lib incompletos');
        }
        var vMean = 0;
        for (var s = 0; s < numSectors; s++) {
          if (!Number.isFinite(A[s]) || !Number.isFinite(k[s]) || k[s] <= 0 || !Number.isFinite(freqs[s])) {
            throw new Error('Valores Weibull .lib inválidos');
          }
          var vSec = A[s] * lanczosGamma(1 + 1 / k[s]);
          vMean += (freqs[s] / 100) * vSec;
        }
        heightData.push({ heightM: heights[h], A: A, k: k, vMean: Number(vMean.toFixed(2)) });
      }
      roughnessBlocks.push({ z0: roughnesses[r], freqs: freqs, heightData: heightData });
    }

    var fieldBlock = roughnessBlocks.find(function (b) { return Math.abs(b.z0 - 0.03) < 0.01; }) || roughnessBlocks[1] || roughnessBlocks[0];
    var h10 = fieldBlock && (fieldBlock.heightData.find(function (d) { return d.heightM === 10; }) || fieldBlock.heightData[0]);
    var h50 = fieldBlock && (fieldBlock.heightData.find(function (d) { return d.heightM === 50; }) || fieldBlock.heightData[1] || h10);
    if (!h10 || !h50) {
      throw new Error('Alturas de referencia .lib ausentes');
    }

    var alpha = (h50.vMean > h10.vMean && h10.vMean > 0)
      ? Math.log(h50.vMean / h10.vMean) / Math.log(50 / 10)
      : 0.143;

    var maxFreq = -1;
    var prevailingSectorIdx = 0;
    for (var sec = 0; sec < numSectors; sec++) {
      if (fieldBlock.freqs[sec] > maxFreq) {
        maxFreq = fieldBlock.freqs[sec];
        prevailingSectorIdx = sec;
      }
    }
    var prevailingDeg = Math.round((prevailingSectorIdx * (360 / numSectors)) % 360);

    return {
      source: 'Global Wind Atlas 3.0 (DTU / World Bank 250m WAsP)',
      latitude: lat,
      longitude: lon,
      vMeanRefMs: h10.vMean,
      refHeightM: 10,
      vMean50mMs: h50.vMean,
      shearExponentAlpha: Number(Math.max(0.08, Math.min(0.40, alpha)).toFixed(3)),
      weibullK: Number(h10.k[prevailingSectorIdx].toFixed(2)),
      prevailingWindDirDeg: prevailingDeg,
      ambientTempC: 15.0,
      sectorFrequencies: fieldBlock.freqs,
      sectorA10: h10.A,
      sectorK10: h10.k,
      roughnesses: roughnesses,
      heights: heights
    };
  }

  /**
   * Valida URL HTTPS y sufijo exacto de host permitido (anti-SSRF).
   * @param {string} rawUrl
   * @param {string|null} allowedHostSuffix
   * @returns {URL}
   */
  function validateHttpsUrl(rawUrl, allowedHostSuffix) {
    var parsed;
    try {
      parsed = new URL(rawUrl);
    } catch (e) {
      throw new Error('URL inválida');
    }
    if (parsed.protocol !== 'https:') {
      throw new Error('Protocolo no permitido: ' + parsed.protocol);
    }
    if (allowedHostSuffix) {
      var host = parsed.hostname.toLowerCase();
      var suffix = String(allowedHostSuffix).toLowerCase().replace(/^\./, '');
      if (host !== suffix && !host.endsWith('.' + suffix)) {
        throw new Error('Host no permitido: ' + parsed.hostname);
      }
    }
    return parsed;
  }

  return {
    lanczosGamma: lanczosGamma,
    parseWAsPLib: parseWAsPLib,
    validateHttpsUrl: validateHttpsUrl
  };
});
