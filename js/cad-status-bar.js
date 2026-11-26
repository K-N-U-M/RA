/**
 * js/cad-status-bar.js
 * Barra de estado CAD inferior discreta (#ra-cad-status-bar)
 * Muestra el paso activo, estado de snap/herramienta y atajos rápidos.
 */
(function () {
    'use strict';

    if (typeof document === 'undefined') return;

    var STEP_NAMES = {
        1: '1. Emplazamiento',
        2: '2. Campo Solar',
        3: '3. Análisis Solar',
        4: '4. Ingeniería',
        5: '5. Entrega'
    };

    function createStatusBar() {
        if (document.getElementById('ra-cad-status-bar')) return;

        var bar = document.createElement('div');
        bar.id = 'ra-cad-status-bar';
        bar.setAttribute('role', 'status');
        bar.setAttribute('aria-live', 'polite');

        bar.style.cssText = [
            'position:fixed',
            'bottom:8px',
            'left:50%',
            'transform:translateX(-50%)',
            'z-index:900',
            'display:flex',
            'align-items:center',
            'gap:14px',
            'padding:5px 14px',
            'background:rgba(15,23,42,0.82)',
            'backdrop-filter:blur(8px)',
            '-webkit-backdrop-filter:blur(8px)',
            'border:1px solid rgba(148,163,184,0.22)',
            'border-radius:9999px',
            'color:#cbd5e1',
            'font-family:system-ui,-apple-system,sans-serif',
            'font-size:11.5px',
            'line-height:1.2',
            'pointer-events:none',
            'box-shadow:0 4px 16px rgba(0,0,0,0.35)',
            'white-space:nowrap',
            'user-select:none'
        ].join(';');

        bar.innerHTML = [
            '<span id="ra-cad-sb-step" style="color:#38bdf8;font-weight:600;">Paso: 1. Emplazamiento</span>',
            '<span style="color:rgba(148,163,184,0.35);">|</span>',
            '<span id="ra-cad-sb-tool" style="color:#e2e8f0;">Herramienta: Selección</span>',
            '<span style="color:rgba(148,163,184,0.35);">|</span>',
            '<span id="ra-cad-sb-snap" style="color:#94a3b8;">Snap: ON</span>',
            '<span style="color:rgba(148,163,184,0.35);">|</span>',
            '<span style="color:#94a3b8;">' +
                '<kbd style="background:rgba(255,255,255,0.08);padding:1px 4px;border-radius:3px;color:#e2e8f0;">M</kbd> Medir · ' +
                '<kbd style="background:rgba(255,255,255,0.08);padding:1px 4px;border-radius:3px;color:#e2e8f0;">C</kbd> Captura · ' +
                '<kbd style="background:rgba(255,255,255,0.08);padding:1px 4px;border-radius:3px;color:#e2e8f0;">Ctrl+Z</kbd> Deshacer · ' +
                '<kbd style="background:rgba(255,255,255,0.08);padding:1px 4px;border-radius:3px;color:#e2e8f0;">Esc</kbd> Cancelar' +
            '</span>'
        ].join('');

        document.body.appendChild(bar);
    }

    function getActiveStepText() {
        var stepNum = 1;
        if (window.workflowState && typeof window.workflowState.currentStep === 'number') {
            stepNum = window.workflowState.currentStep;
        } else {
            var activeEl = document.querySelector('.workflow-step.active, [data-step].active');
            if (activeEl) {
                var ds = parseInt(activeEl.getAttribute('data-step') || '1', 10);
                if (!isNaN(ds)) stepNum = ds;
            }
        }
        return 'Paso: ' + (STEP_NAMES[stepNum] || ('Paso ' + stepNum));
    }

    function getToolAndSnapState() {
        var tool = 'Selección';
        var snap = 'ON';

        if (window.RAMeasureTool && window.RAMeasureTool.active) {
            tool = 'Cinta Métrica 3D';
            snap = window.RAMeasureTool.snapEnabled === false ? 'OFF' : 'ON';
        } else if (window.RACapture && window.RACapture.active) {
            tool = 'Captura Limpia';
        } else if (window.WP && window.WP.mode && window.WP.mode !== 'idle') {
            tool = 'CAD: ' + window.WP.mode;
        }

        return { tool: tool, snap: snap };
    }

    function refreshStatusBar() {
        var stepEl = document.getElementById('ra-cad-sb-step');
        var toolEl = document.getElementById('ra-cad-sb-tool');
        var snapEl = document.getElementById('ra-cad-sb-snap');
        if (!stepEl || !toolEl || !snapEl) return;

        stepEl.textContent = getActiveStepText();
        var state = getToolAndSnapState();
        toolEl.textContent = 'Herramienta: ' + state.tool;
        snapEl.textContent = 'Snap: ' + state.snap;
        snapEl.style.color = state.snap === 'ON' ? '#34d399' : '#f87171';
    }

    function init() {
        createStatusBar();
        refreshStatusBar();
        setInterval(refreshStatusBar, 500);
        window.addEventListener('keydown', function () {
            setTimeout(refreshStatusBar, 30);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.RACadStatusBar = {
        refresh: refreshStatusBar
    };
})();
