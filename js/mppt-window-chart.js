/**
 * js/mppt-window-chart.js
 * Gráfico SVG limpio de la ventana MPPT del inversor frente a la tensión
 * del string en frío (-10°C, Voc) y en calor (70°C, Vmp).
 * Expone window.RAMpptChart.render(containerId, data)
 */
(function (global) {
    'use strict';

    function esc(s) {
        if (typeof window !== 'undefined' && typeof window.RASanitizer?.escapeHtml === 'function') {
            return window.RASanitizer.escapeHtml(s);
        }
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    function render(containerId, opts) {
        var el = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
        if (!el) return false;

        var d = opts || {};
        var vocCold = Number(d.vocCold) || 0;
        var vmpHot = Number(d.vmpHot) || 0;
        var vMpptMin = Number(d.vMpptMin) || 0;
        var vMpptMax = Number(d.vMpptMax) || 0;
        var vMaxInv = Number(d.vMaxInv) || Math.max(vMpptMax * 1.15, vocCold * 1.05, 1000);

        var maxScale = Math.max(vMaxInv, vocCold, vMpptMax, 100) * 1.08;
        var W = 360;
        var H = 128;
        var padL = 16;
        var padR = 16;
        var barY = 46;
        var barH = 26;
        var plotW = W - padL - padR;

        function xOf(v) {
            var clamped = Math.max(0, Math.min(maxScale, v));
            return padL + (clamped / maxScale) * plotW;
        }

        var xMpptMin = xOf(vMpptMin);
        var xMpptMax = xOf(vMpptMax);
        var xMaxInv = xOf(vMaxInv);
        var xVmpHot = xOf(vmpHot);
        var xVocCold = xOf(vocCold);

        var okHot = vmpHot >= vMpptMin;
        var okCold = vocCold <= vMaxInv;
        var inMpptCold = vocCold <= vMpptMax;
        var statusOk = okHot && okCold;

        var hotColor = okHot ? '#f59e0b' : '#ef4444';
        var coldColor = okCold ? (inMpptCold ? '#38bdf8' : '#a78bfa') : '#ef4444';

        var svg = [
            '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Ventana MPPT del inversor">',
            '  <rect x="' + padL + '" y="' + barY + '" width="' + plotW + '" height="' + barH + '" rx="5" fill="#1e293b" stroke="#334155" stroke-width="1"/>',
            '  <rect x="' + xMpptMin.toFixed(1) + '" y="' + barY + '" width="' + Math.max(2, xMpptMax - xMpptMin).toFixed(1) + '" height="' + barH + '" rx="3" fill="rgba(16, 185, 129, 0.28)" stroke="#10b981" stroke-width="1.5"/>',
            '  <line x1="' + xMaxInv.toFixed(1) + '" y1="' + (barY - 6) + '" x2="' + xMaxInv.toFixed(1) + '" y2="' + (barY + barH + 6) + '" stroke="#ef4444" stroke-width="2" stroke-dasharray="3,2"/>',
            '  <text x="' + xMaxInv.toFixed(1) + '" y="' + (barY - 10) + '" text-anchor="middle" font-size="9.5" fill="#fca5a5" font-family="system-ui,sans-serif">Vmax ' + Math.round(vMaxInv) + 'V</text>',
            '  <text x="' + ((xMpptMin + xMpptMax) / 2).toFixed(1) + '" y="' + (barY + barH / 2 + 3.5) + '" text-anchor="middle" font-size="10" font-weight="600" fill="#6ee7b7" font-family="system-ui,sans-serif">MPPT ' + Math.round(vMpptMin) + '–' + Math.round(vMpptMax) + 'V</text>',
            '  <circle cx="' + xVmpHot.toFixed(1) + '" cy="' + (barY + barH / 2) + '" r="5.5" fill="' + hotColor + '" stroke="#0f172a" stroke-width="1.5"/>',
            '  <text x="' + xVmpHot.toFixed(1) + '" y="' + (barY + barH + 18) + '" text-anchor="middle" font-size="9.5" fill="' + hotColor + '" font-family="system-ui,sans-serif">Vmp 70°C: ' + Math.round(vmpHot) + 'V</text>',
            '  <circle cx="' + xVocCold.toFixed(1) + '" cy="' + (barY + barH / 2) + '" r="5.5" fill="' + coldColor + '" stroke="#0f172a" stroke-width="1.5"/>',
            '  <text x="' + xVocCold.toFixed(1) + '" y="' + (barY + barH + 32) + '" text-anchor="middle" font-size="9.5" fill="' + coldColor + '" font-family="system-ui,sans-serif">Voc -10°C: ' + Math.round(vocCold) + 'V</text>',
            '  <text x="' + padL + '" y="16" font-size="10.5" font-weight="600" fill="' + (statusOk ? '#cbd5e1' : '#fca5a5') + '" font-family="system-ui,sans-serif">' + esc(statusOk ? 'Ventana MPPT compatible' : 'Fuera de rango de tensión') + '</text>',
            '</svg>'
        ].join('\n');

        el.innerHTML = svg;
        return true;
    }

    global.RAMpptChart = {
        render: render
    };
})(window);
