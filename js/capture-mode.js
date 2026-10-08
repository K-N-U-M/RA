/**
 * ============================================================================
 * 📷 RA · CAPTURE MODE (Modo captura limpia — P3 UX, 29/09/2026)
 * ============================================================================
 * Oculta el andamiaje CAD del visor 3D (vértices, polilíneas de faldones,
 * rellenos de planos de trabajo, badges flotantes, tríada/gizmo 2D) para
 * obtener capturas de pantalla limpias con solo la disposición de paneles,
 * obstáculos y edificios.
 *
 * Uso: tecla `C` (fuera de campos de texto y de modos de dibujo) o el botón
 * flotante "📷 CAPTURA LIMPIA". En modo activo el botón se atenúa (0.15 de
 * opacidad) para no aparecer en la captura; recupera opacidad al pasar el ratón.
 *
 * Técnica: los grupos WP.ents.* contienen EXCLUSIVAMENTE andamiaje CAD, así
 * que el toggle muta `entity.show` (no destruye entidades ni primitivas GPU)
 * y oculta el canvas overlay `#ra-triad-overlay`. `renderTriad2D` hace
 * early-return mientras el modo está activo, y wpRenderAllPolylines /
 * wpRenderActivePlaneGizmo re-aplican el ocultado si algo re-renderiza.
 * ============================================================================
 */
(function (global) {
  'use strict';

  // Grupos de WP.ents que son 100% andamiaje CAD (nunca contienen paneles/obstáculos/edificios).
  // 'gizmos' = handles de la tríada 3D en el vértice seleccionado (círculos azules).
  var GROUPS = ['polys', 'activePoly', 'planePreview', 'activePlaneMarker', 'inactivePlanes', 'gizmos'];
  // [FIX] Barrido por prefijo de ID: caza TODO andamiaje 'wp_*' aunque haya sido creado por
  // rutas que no lo registran en WP.ents (p.ej. marcadores legacy del bloque inline) y la
  // forma activa 'ra_active_shape'. Los cables/equipos usan otros prefijos (ra_route_*, sState)
  // y NO se tocan. Se registra lo oculto para restaurarlo exactamente.
  var HIDE_ID_PREFIXES = ['wp_', 'ra_active_shape'];
  var _hiddenById = [];
  var state = { enabled: false, btn: null };

  function ensureButton() {
    if (state.btn && document.body && document.body.contains(state.btn)) return state.btn;
    if (!document.body) return null;
    var btn = document.createElement('button');
    btn.id = 'ra-capture-mode-btn';
    btn.type = 'button';
    btn.textContent = '📷 CAPTURA LIMPIA (C)';
    btn.title = 'Oculta vértices, polilíneas, planos de trabajo y tríada CAD para capturas de pantalla limpias. Tecla: C';
    Object.assign(btn.style, {
      display: 'none', // Oculto por petición del usuario, pero la tecla C sigue funcionando
      position: 'fixed', right: '14px', bottom: '46px', zIndex: '9998',
      background: 'rgba(10,16,29,0.85)', color: '#E2E8F0',
      border: '1px solid rgba(56,189,248,0.35)', borderRadius: '8px',
      padding: '7px 12px', font: '600 10.5px Inter, system-ui, sans-serif',
      letterSpacing: '0.4px', cursor: 'pointer', backdropFilter: 'blur(6px)',
      transition: 'opacity 0.25s, border-color 0.25s'
    });
    btn.addEventListener('click', function () { api.toggle(); });
    document.body.appendChild(btn);
    state.btn = btn;
    return btn;
  }

  function eachGroupEntity(fn) {
    var WP = global.WP;
    if (!WP || !WP.ents) return;
    GROUPS.forEach(function (k) {
      var arr = WP.ents[k];
      if (Array.isArray(arr)) {
        arr.forEach(function (e) { try { fn(e); } catch (err) { /* entidad ya retirada */ } });
      }
    });
  }

  function hideCanvas() {
    var c = document.getElementById('ra-triad-overlay');
    if (c) c.style.display = 'none';
  }

  function showCanvas() {
    var c = document.getElementById('ra-triad-overlay');
    if (c) c.style.display = '';
  }

  function sweepHide() {
    _hiddenById = [];
    if (!global.viewer || !global.viewer.entities || !Array.isArray(global.viewer.entities.values)) return;
    global.viewer.entities.values.slice().forEach(function (e) {
      var id = e.id;
      if (typeof id !== 'string') return;
      for (var i = 0; i < HIDE_ID_PREFIXES.length; i++) {
        if (id.indexOf(HIDE_ID_PREFIXES[i]) === 0) {
          e.show = false;
          _hiddenById.push(e);
          break;
        }
      }
    });
  }

  function sweepShow() {
    _hiddenById.forEach(function (e) { try { e.show = true; } catch (err) { /* retirada */ } });
    _hiddenById = [];
  }

  function apply() {
    eachGroupEntity(function (e) { e.show = false; });
    sweepHide();
    hideCanvas();
    if (global.viewer && global.viewer.scene && typeof global.viewer.scene.requestRender === 'function') {
      global.viewer.scene.requestRender();
    }
  }

  function restore() {
    eachGroupEntity(function (e) { e.show = true; });
    sweepShow();
    showCanvas();
    if (global.viewer && global.viewer.scene && typeof global.viewer.scene.requestRender === 'function') {
      global.viewer.scene.requestRender();
    }
  }

  function updateBtn() {
    var b = state.btn;
    if (!b) return;
    if (state.enabled) {
      b.textContent = '📷 CAPTURA ACTIVA — C para salir';
      b.style.borderColor = 'rgba(52,211,153,0.6)';
      b.style.opacity = '0.15'; // casi invisible en la captura; hover restaura
      b.onmouseenter = function () { b.style.opacity = '1'; };
      b.onmouseleave = function () { b.style.opacity = '0.15'; };
    } else {
      b.textContent = '📷 CAPTURA LIMPIA (C)';
      b.style.borderColor = 'rgba(56,189,248,0.35)';
      b.style.opacity = '1';
      b.onmouseenter = null;
      b.onmouseleave = null;
    }
  }

  var api = {
    get enabled() { return state.enabled; },
    toggle: function () {
      if (state.enabled) api.disable(); else api.enable();
      return state.enabled;
    },
    enable: function () {
      state.enabled = true;
      ensureButton();
      apply();
      updateBtn();
      if (typeof global.showToast === 'function') {
        global.showToast('CAPTURA LIMPIA', 'Andamiaje CAD oculto (vértices, polilíneas, planos, tríada). Pulsa C o el botón para restaurar.', 'info', 3500);
      }
    },
    disable: function () {
      state.enabled = false;
      restore();
      updateBtn();
      if (typeof global.showToast === 'function') {
        global.showToast('VISTA DE EDICIÓN', 'Andamiaje CAD restaurado.', 'info', 2200);
      }
    },
    // Gancho para re-renders que recrean entidades mientras el modo está activo
    reapply: function () { if (state.enabled) apply(); }
  };

  global.RACapture = api;

  // Tecla C — ignorada en campos de texto y durante herramientas de dibujo activas
  document.addEventListener('keydown', function (e) {
    if (e.code !== 'KeyC' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    var t = e.target;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '')) return;
    if (t && t.isContentEditable) return;
    if (global.WP && global.WP.mode && global.WP.mode !== 'idle') return;
    e.preventDefault();
    api.toggle();
  });

  // Botón disponible en cuanto hay DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureButton);
  } else {
    ensureButton();
  }

})(typeof window !== 'undefined' ? window : this);
