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
            'bottom:76px',
            'left:50%',
            'transform:translateX(-50%)',
            'z-index:900',
            'display:flex',
            'align-items:center',
            'gap:14px',
            'padding:5px 14px',
            'background:rgba(243,245,248,0.92)',
            'backdrop-filter:blur(8px)',
            '-webkit-backdrop-filter:blur(8px)',
            'border:1px solid rgba(255,255,255,0.75)',
            'border-radius:9999px',
            'color:#57606a',
            'font-family:system-ui,-apple-system,sans-serif',
            'font-size:11.5px',
            'line-height:1.2',
            'pointer-events:none',
            'box-shadow:5px 5px 12px rgba(163,173,188,0.4),-5px -5px 12px rgba(255,255,255,0.85)',
            'white-space:nowrap',
            'user-select:none'
        ].join(';');

        bar.innerHTML = [
            '<span id="ra-cad-sb-step" style="color:#e8a204;font-weight:700;">Paso: 1. Emplazamiento</span>',
            '<span style="color:rgba(87,96,106,0.3);">|</span>',
            '<span id="ra-cad-sb-tool" style="color:#382a21;font-weight:500;">Herramienta: Selección</span>',
            '<span style="color:rgba(87,96,106,0.3);">|</span>',
            '<span id="ra-cad-sb-snap" style="color:#57606a;">Snap: ON</span>',
            '<span style="color:rgba(87,96,106,0.3);">|</span>',
            '<span style="color:#57606a;">' +
                '<kbd style="background:#dfe3e8;padding:1px 5px;border-radius:4px;color:#382a21;border:1px solid rgba(255,255,255,0.6);">M</kbd> Medir · ' +
                '<kbd style="background:#dfe3e8;padding:1px 5px;border-radius:4px;color:#382a21;border:1px solid rgba(255,255,255,0.6);">C</kbd> Captura · ' +
                '<kbd style="background:#dfe3e8;padding:1px 5px;border-radius:4px;color:#382a21;border:1px solid rgba(255,255,255,0.6);">Ctrl+Z</kbd> Deshacer · ' +
                '<kbd style="background:#dfe3e8;padding:1px 5px;border-radius:4px;color:#382a21;border:1px solid rgba(255,255,255,0.6);">Esc</kbd> Cancelar' +
            '</span>'
        ].join('');

        document.body.appendChild(bar);
    }

    function getActiveStepText() {
        var stepNum = 1;
        if (typeof window.wpCurrentStep === 'number' && !isNaN(window.wpCurrentStep)) {
            stepNum = window.wpCurrentStep;
        } else {
            var activeEl = document.querySelector('.wp-step-btn.active, [data-step].active');
            if (activeEl) {
                var dsAttr = activeEl.getAttribute('data-step');
                var idMatch = activeEl.id && activeEl.id.match(/wp-step-(\d+)-btn/);
                var numEl = activeEl.querySelector ? activeEl.querySelector('.wp-step-num') : null;
                var raw = dsAttr || (idMatch && idMatch[1]) || (numEl && numEl.textContent) || '1';
                var ds = parseInt(raw, 10);
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

    function scheduleRefresh() {
        setTimeout(refreshStatusBar, 30);
    }

    function init() {
        createStatusBar();
        refreshStatusBar();

        var events = window.RA && window.RA.events;
        var store = window.RA && window.RA.Store;

        if (events && typeof events.on === 'function') {
            var evNames = [
                'step:changed',
                'mode:changed',
                'tool:changed',
                'selection:changed',
                'scene:updated',
                'measure:toggled',
                'capture:toggled'
            ];
            for (var i = 0; i < evNames.length; i++) {
                events.on(evNames[i], refreshStatusBar);
            }
            if (store && typeof store.subscribe === 'function') {
                store.subscribe('step', refreshStatusBar);
                store.subscribe('mode', refreshStatusBar);
                store.subscribe('tool', refreshStatusBar);
                store.subscribe('snap', refreshStatusBar);
            }
            if (window.WorkflowOrchestrator && typeof window.WorkflowOrchestrator.on === 'function') {
                window.WorkflowOrchestrator.on('step_changed', refreshStatusBar);
            }
            document.addEventListener('click', scheduleRefresh, true);
            window.addEventListener('pointerup', scheduleRefresh, true);
        } else {
            // Fallback seguro si ra-events.js aún no ha cargado
            setInterval(refreshStatusBar, 500);
        }

        window.addEventListener('keydown', scheduleRefresh);
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
