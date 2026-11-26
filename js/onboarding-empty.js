/**
 * js/onboarding-empty.js
 * Tarjeta flotante discreta de bienvenida (Empty State) cuando la escena
 * no tiene faldones ni planos en window.WP.
 * Expone window.RAOnboarding
 */
(function (global) {
    'use strict';

    var CARD_ID = 'ra-onboarding-empty-card';
    var dismissed = false;
    var pollTimer = null;
    var unsubs = [];
    var domListenersBound = false;

    function isSceneEmpty() {
        var wp = global.WP;
        if (!wp) return true;
        var hasPolylines = Array.isArray(wp.polylines) && wp.polylines.length > 0;
        var hasPlanes = Array.isArray(wp.planes) && wp.planes.length > 0;
        return !hasPolylines && !hasPlanes;
    }

    function hide() {
        var card = document.getElementById(CARD_ID);
        if (card && card.parentNode) {
            card.parentNode.removeChild(card);
        }
    }

    function cleanupSubscriptions() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
        while (unsubs.length > 0) {
            var fn = unsubs.pop();
            try { if (typeof fn === 'function') fn(); } catch (e) {}
        }
        if (domListenersBound) {
            domListenersBound = false;
            document.removeEventListener('pointerup', scheduleSync, true);
            global.removeEventListener('keyup', scheduleSync, true);
        }
    }

    function syncVisibility() {
        if (dismissed || !isSceneEmpty()) {
            hide();
            if (!isSceneEmpty()) {
                cleanupSubscriptions();
            }
        }
    }

    function scheduleSync() {
        setTimeout(syncVisibility, 40);
    }

    function close() {
        dismissed = true;
        hide();
        cleanupSubscriptions();
    }

    function triggerSearch() {
        var searchInput = document.querySelector('#ra-search-input, #search-input, #geocoder-input, input[type="search"], .cesium-geocoder-input');
        if (searchInput) {
            if (typeof searchInput.scrollIntoView === 'function') {
                searchInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
            searchInput.focus();
            if (typeof searchInput.select === 'function') searchInput.select();
        }
    }

    function triggerDrawRoof() {
        var roofBody = document.getElementById('wp-subdock-body-roof');
        if (roofBody && roofBody.style.display === 'none') {
            if (typeof global.wpToggleEmplacementSection === 'function') {
                global.wpToggleEmplacementSection('roof', true);
            } else {
                roofBody.style.display = 'flex';
            }
        }
        if (typeof global.startPolylineDrawMode === 'function') {
            global.startPolylineDrawMode();
        } else if (typeof global.wpStartDrawPolyline === 'function') {
            global.wpStartDrawPolyline();
        } else if (typeof global.wpToggleDrawMode === 'function') {
            global.wpToggleDrawMode();
        } else {
            var btn = document.querySelector('#btn-draw-polyline, [data-action="draw-roof"], #wp-draw-btn');
            if (btn && typeof btn.click === 'function') btn.click();
        }
    }

    function show() {
        if (dismissed || !isSceneEmpty()) {
            hide();
            return;
        }
        if (document.getElementById(CARD_ID)) return;

        var card = document.createElement('div');
        card.id = CARD_ID;
        card.style.cssText = [
            'position:fixed',
            'bottom:24px',
            'left:50%',
            'transform:translateX(-50%)',
            'z-index:950',
            'background:rgba(15,23,42,0.92)',
            'backdrop-filter:blur(10px)',
            'border:1px solid rgba(56,189,248,0.35)',
            'border-radius:12px',
            'padding:12px 16px',
            'color:#e2e8f0',
            'font-family:system-ui,-apple-system,sans-serif',
            'font-size:13px',
            'box-shadow:0 10px 28px rgba(0,0,0,0.45)',
            'display:flex',
            'align-items:center',
            'gap:10px',
            'flex-wrap:wrap'
        ].join(';');

        card.innerHTML = [
            '<span style="font-weight:600;color:#f8fafc;margin-right:4px;">Empieza tu proyecto:</span>',
            '<button type="button" data-ra-onb="search" style="background:#1e293b;color:#38bdf8;border:1px solid rgba(56,189,248,0.4);border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px;font-weight:500;">1. Buscar dirección</button>',
            '<button type="button" data-ra-onb="draw" style="background:#0284c7;color:#ffffff;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px;font-weight:600;">2. Dibujar cubierta</button>',
            '<button type="button" data-ra-onb="close" style="background:transparent;color:#94a3b8;border:1px solid #334155;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px;">Cerrar</button>'
        ].join('');

        card.addEventListener('click', function (ev) {
            var target = ev.target && ev.target.closest ? ev.target.closest('[data-ra-onb]') : null;
            if (!target) return;
            var action = target.getAttribute('data-ra-onb');
            if (action === 'search') triggerSearch();
            else if (action === 'draw') triggerDrawRoof();
            else if (action === 'close') close();
        });

        document.body.appendChild(card);
    }

    function init() {
        show();
        if (dismissed || !isSceneEmpty()) return;

        var events = global.RA && global.RA.events;
        var store = global.RA && global.RA.Store;

        if (events && typeof events.on === 'function') {
            var evNames = ['roof:updated', 'plane:updated', 'panels:updated', 'scene:updated', 'project:loaded', 'step:changed'];
            for (var i = 0; i < evNames.length; i++) {
                unsubs.push(events.on(evNames[i], syncVisibility));
            }
            if (store && typeof store.subscribe === 'function') {
                unsubs.push(store.subscribe('sceneEmpty', syncVisibility));
                unsubs.push(store.subscribe('step', syncVisibility));
            }
            if (global.ProjectHierarchy && typeof global.ProjectHierarchy.subscribe === 'function') {
                var phUnsub = global.ProjectHierarchy.subscribe(syncVisibility);
                if (typeof phUnsub === 'function') unsubs.push(phUnsub);
            }
            if (!domListenersBound) {
                domListenersBound = true;
                document.addEventListener('pointerup', scheduleSync, true);
                global.addEventListener('keyup', scheduleSync, true);
            }
        } else if (!pollTimer) {
            // Fallback seguro si ra-events.js aún no ha cargado
            pollTimer = setInterval(syncVisibility, 600);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.RAOnboarding = {
        show: show,
        hide: hide,
        close: close,
        isSceneEmpty: isSceneEmpty
    };
})(window);
