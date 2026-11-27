/**
 * ============================================================================
 * ✨ RA · UI KINETIC MOTION ORCHESTRATOR
 * ============================================================================
 * Orquestador ligero y seguro para:
 *   - Cascada escalonada (staggered fade+slide+zoom) al cambiar de paso o abrir acordeones/modales
 *   - Ondas táctiles (ripple) en botones interactivos sin alterar posicionamiento fixed/absolute
 *   - Spotlight magnético suave en tarjetas (CSS vars --ra-mx / --ra-my)
 *   - Rebote luminoso (KPI bump) cuando cambian métricas clave en tiempo real
 *   - Respeta prefers-reduced-motion y excluye #cesiumContainer / canvas WebGL
 * ============================================================================
 */
(function (global) {
  'use strict';

  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  const REDUCED_MOTION = !!(
    global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  const CARD_SELECTOR = [
    '.ui-card',
    '.wp-card',
    '.ra-card',
    '.cat-card',
    '.eq-card',
    '.doc-card',
    '.solar-card',
    '.wind-card',
    '.faldon-card',
    '.engine-card-opt',
    '.doc-modal-section',
    '.stat-pill',
    '#faldon-edit-card',
    '.wp-subdock'
  ].join(', ');

  const RIPPLE_SELECTOR = [
    '.wp-step-btn:not(.disabled)',
    '#ra-sidebar button:not(.disabled)',
    '#ra-floating-tools-container button',
    '[id$="-modal"] button',
    '[role="dialog"] button',
    '.engine-card-opt',
    '.cat-nav-pill',
    '.step2-gen-tab-btn',
    'button.primary',
    '.btn-primary'
  ].join(', ');

  const KPI_SELECTOR = [
    '.stat-pill-value',
    '#p3-stat-panels',
    '#p3-stat-kwp',
    '#p3-stat-strings',
    '[id^="p2-kpi-"]'
  ].join(', ');

  // Contenedores cuyas aperturas activan animaciones en cascada
  const STEP_IDS = [
    'wp-step-2-content',
    'wp-step-3-content',
    'wp-step-4-content',
    'wp-step-5-content',
    'wp-p1-plane-content',
    'wp-p1-roof-content',
    'wp-p1-obs-content'
  ];

  const SUBDOCK_IDS = [
    'wp-subdock-body-plane',
    'wp-subdock-body-roof',
    'wp-subdock-body-obs'
  ];

  function _clearClassLater(el, cls, delayMs) {
    if (!el) return;
    const done = () => el.classList.remove(cls);
    el.addEventListener('animationend', done, { once: true });
    setTimeout(done, delayMs || 700);
  }

  function animateContainerEntrance(container, containerClass, staggerLimit) {
    if (REDUCED_MOTION || !container) return;
    try {
      if (containerClass) {
        container.classList.remove(containerClass);
        void container.offsetWidth;
        container.classList.add(containerClass);
        _clearClassLater(container, containerClass, 550);
      }

      const cards = container.querySelectorAll(CARD_SELECTOR);
      const maxStagger = typeof staggerLimit === 'number' ? staggerLimit : 10;
      let visibleIdx = 0;

      cards.forEach((card) => {
        if (!card || card.closest('#cesiumContainer')) return;
        card.classList.add('ra-spotlight-card');

        const cs = global.getComputedStyle ? global.getComputedStyle(card) : null;
        if (cs && cs.display === 'none') return;

        const i = Math.min(visibleIdx++, maxStagger);
        card.style.setProperty('--ra-stagger-i', String(i));
        card.classList.remove('ra-anim-enter');
        void card.offsetWidth;
        card.classList.add('ra-anim-enter');
        _clearClassLater(card, 'ra-anim-enter', 520 + i * 45);
      });
    } catch (_) {
      // No-op defensivo: las animaciones nunca bloquean el flujo funcional
    }
  }

  function decorateExistingCards(root) {
    try {
      const scope = root || document;
      const cards = scope.querySelectorAll(CARD_SELECTOR);
      cards.forEach((c) => {
        if (c && !c.closest('#cesiumContainer')) {
          c.classList.add('ra-spotlight-card');
        }
      });
    } catch (_) {}
  }

  // ── 1. Ondas Táctiles (Ripple) Seguras ─────────────────────────────────────
  function setupRippleHandler() {
    if (REDUCED_MOTION) return;
    document.addEventListener('pointerdown', function (e) {
      const target = e.target && e.target.closest ? e.target.closest(RIPPLE_SELECTOR) : null;
      if (!target || target.disabled || target.classList.contains('disabled')) return;
      if (target.closest('#cesiumContainer')) return;

      try {
        const cs = global.getComputedStyle(target);
        // Nunca cambiar position de elementos fixed/absolute/sticky para no romper coordenadas
        if (cs.position !== 'static' && cs.position !== 'relative') return;

        target.classList.add('ra-ripple-host');
        const rect = target.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        const ripple = document.createElement('span');
        ripple.className = 'ra-ripple';
        const x = (typeof e.clientX === 'number' && e.clientX > 0) ? (e.clientX - rect.left) : rect.width / 2;
        const y = (typeof e.clientY === 'number' && e.clientY > 0) ? (e.clientY - rect.top) : rect.height / 2;
        const size = Math.max(rect.width, rect.height) * 1.15;

        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        ripple.style.width = size + 'px';
        ripple.style.height = size + 'px';

        target.appendChild(ripple);
        setTimeout(() => {
          if (ripple.parentNode) ripple.remove();
        }, 600);
      } catch (_) {}
    }, { passive: true });
  }

  // ── 2. Spotlight Magnético sobre Tarjetas ──────────────────────────────────
  function setupSpotlightTracker() {
    if (REDUCED_MOTION) return;
    let rafId = 0;
    let pendingEvent = null;

    document.addEventListener('pointermove', function (e) {
      const card = e.target && e.target.closest ? e.target.closest('.ra-spotlight-card') : null;
      if (!card) return;
      pendingEvent = { card, x: e.clientX, y: e.clientY };
      if (rafId) return;

      rafId = global.requestAnimationFrame(() => {
        rafId = 0;
        if (!pendingEvent) return;
        const { card: c, x, y } = pendingEvent;
        pendingEvent = null;
        try {
          const rect = c.getBoundingClientRect();
          if (rect.width && rect.height) {
            c.style.setProperty('--ra-mx', Math.round(x - rect.left) + 'px');
            c.style.setProperty('--ra-my', Math.round(y - rect.top) + 'px');
          }
        } catch (_) {}
      });
    }, { passive: true });
  }

  // ── 3. Observador de Pasos, Acordeones, Modales y KPIs ─────────────────────
  function setupVisibilityAndKpiObservers() {
    if (typeof MutationObserver === 'undefined') return;

    const lastDisplay = new WeakMap();
    const kpiPrevText = new WeakMap();

    const styleObserver = new MutationObserver((mutations) => {
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        const el = m.target;
        if (!el || el.nodeType !== 1) continue;

        const id = el.id || '';
        const isStep = STEP_IDS.indexOf(id) !== -1;
        const isSubdock = SUBDOCK_IDS.indexOf(id) !== -1;
        const isModal = id.endsWith('-modal') || el.getAttribute('role') === 'dialog' || el.classList.contains('dock-popover');

        if (!isStep && !isSubdock && !isModal) continue;

        const cs = global.getComputedStyle ? global.getComputedStyle(el) : null;
        const nowVisible = !!(cs && cs.display !== 'none' && cs.visibility !== 'hidden');
        const wasVisible = lastDisplay.get(el) === true;
        lastDisplay.set(el, nowVisible);

        if (nowVisible && !wasVisible) {
          if (isStep) {
            animateContainerEntrance(el, 'ra-step-entering', 10);
          } else if (isSubdock) {
            animateContainerEntrance(el, 'ra-subdock-opening', 8);
          } else if (isModal) {
            decorateExistingCards(el);
            animateContainerEntrance(el, null, 8);
          }
        }
      }
    });

    const targets = [];
    STEP_IDS.concat(SUBDOCK_IDS).forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        const cs = global.getComputedStyle ? global.getComputedStyle(el) : null;
        lastDisplay.set(el, !!(cs && cs.display !== 'none'));
        targets.push(el);
      }
    });

    document.querySelectorAll('[id$="-modal"], [role="dialog"]:not(#cesiumContainer):not(.cesium-viewer)').forEach((el) => {
      const cs = global.getComputedStyle ? global.getComputedStyle(el) : null;
      lastDisplay.set(el, !!(cs && cs.display !== 'none'));
      targets.push(el);
    });

    targets.forEach((el) => {
      styleObserver.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
    });

    // Observar cambios de texto en KPIs para pulso visual inmediato
    const kpiObserver = new MutationObserver((mutations) => {
      if (REDUCED_MOTION) return;
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        const target = m.target && m.target.nodeType === 3 ? m.target.parentElement : m.target;
        if (!target || !target.matches || !target.matches(KPI_SELECTOR)) continue;
        const nextVal = (target.textContent || '').trim();
        const prevVal = kpiPrevText.get(target);
        if (prevVal !== undefined && prevVal !== nextVal && nextVal !== '') {
          target.classList.remove('ra-kpi-bump');
          void target.offsetWidth;
          target.classList.add('ra-kpi-bump');
          _clearClassLater(target, 'ra-kpi-bump', 620);
        }
        kpiPrevText.set(target, nextVal);
      }
    });

    document.querySelectorAll(KPI_SELECTOR).forEach((el) => {
      kpiPrevText.set(el, (el.textContent || '').trim());
      kpiObserver.observe(el, { childList: true, characterData: true, subtree: true });
    });
  }

  // ── 4. Integración con WorkflowOrchestrator y Arranque ─────────────────────
  function syncStepAttr(step) {
    if (document.body && step) {
      document.body.setAttribute('data-ra-step', String(step));
    }
  }

  function setupWorkflowHook() {
    syncStepAttr(global.wpCurrentStep || 1);
    if (global.WorkflowOrchestrator && typeof global.WorkflowOrchestrator.on === 'function') {
      global.WorkflowOrchestrator.on('step_changed', (payload) => {
        if (!payload || !payload.step) return;
        syncStepAttr(payload.step);
        const stepId = payload.step === 1 ? 'wp-p1-plane-content' : ('wp-step-' + payload.step + '-content');
        const el = document.getElementById(stepId);
        if (el) animateContainerEntrance(el, 'ra-step-entering', 10);
      });
    }
  }

  // ── 5. Gran Entrada Sincronizada de la Pantalla Principal ──────────────────
  let _revealTriggered = false;

  function triggerAppReveal() {
    if (_revealTriggered) return;
    _revealTriggered = true;

    const body = document.body;
    if (!body) return;

    body.classList.remove('ra-pre-reveal');

    if (REDUCED_MOTION) {
      body.classList.add('ra-app-entered');
      return;
    }

    body.classList.add('ra-app-entering');

    const firstActive = document.getElementById('wp-p1-plane-content') || document.getElementById('wp-subdock-body-plane');
    if (firstActive) {
      animateContainerEntrance(firstActive, null, 7);
    }

    setTimeout(() => {
      body.classList.remove('ra-app-entering');
      body.classList.add('ra-app-entered');
    }, 4250);
  }

  function setupGrandEntrance() {
    const ldScreen = document.getElementById('ra-loading');
    const isSplashActive = !!(ldScreen && !ldScreen.classList.contains('fade-out'));

    if (isSplashActive && document.body && !REDUCED_MOTION) {
      document.body.classList.add('ra-pre-reveal');
    }

    global.addEventListener('ra:app-reveal', triggerAppReveal, { once: true });

    if (ldScreen && typeof MutationObserver !== 'undefined') {
      const splashObs = new MutationObserver(() => {
        if (!document.body.contains(ldScreen) || ldScreen.classList.contains('fade-out')) {
          splashObs.disconnect();
          triggerAppReveal();
        }
      });
      splashObs.observe(ldScreen, { attributes: true, attributeFilter: ['class'] });
      if (ldScreen.parentNode) {
        splashObs.observe(ldScreen.parentNode, { childList: true });
      }
    }

    if (!isSplashActive) {
      triggerAppReveal();
    } else {
      // Fallback de seguridad garantizado: nunca dejar la UI oculta
      setTimeout(triggerAppReveal, 8500);
    }
  }

  // ── 6. Aislamiento de Foco al Abrir Cualquier Modal (Oculta HUDs flotantes) ──
  const MODAL_SELECTOR = 'div[id$="-modal"], [role="dialog"]:not(#cesiumContainer):not(.cesium-viewer), [role="alertdialog"], .ra-modal';

  function syncModalOpenClass() {
    if (!document.body) return;
    let hasOpen = false;
    try {
      const candidates = document.querySelectorAll(MODAL_SELECTOR);
      for (let i = 0; i < candidates.length; i++) {
        const el = candidates[i];
        if (!el || el.tagName === 'BUTTON' || el.id === 'ra-floating-settings-popover') continue;
        const cs = global.getComputedStyle ? global.getComputedStyle(el) : null;
        if (!cs || cs.position !== 'fixed') continue;
        if (el.classList && el.classList.contains('open')) {
          hasOpen = true;
          break;
        }
        if (cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0') {
          hasOpen = true;
          break;
        }
      }
    } catch (_) {}
    document.body.classList.toggle('ra-modal-open', hasOpen);
  }

  function setupModalFocusIsolation() {
    syncModalOpenClass();
    if (typeof MutationObserver === 'undefined' || !document.body) return;

    const modalObserver = new MutationObserver(() => {
      syncModalOpenClass();
    });
    modalObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'aria-hidden']
    });
  }

  // ── 7. Tooltips Globales Claros (Sustituye Globos Negros Nativos) ─────────
  function setupGlobalLightTooltips() {
    if (!document.body) return;

    let tipEl = document.getElementById('ra-global-tooltip');
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.id = 'ra-global-tooltip';
      tipEl.setAttribute('role', 'tooltip');
      document.body.appendChild(tipEl);
    }

    let activeHost = null;
    let showTimer = null;

    function hideTip() {
      clearTimeout(showTimer);
      activeHost = null;
      tipEl.classList.remove('visible');
    }

    function positionTip(target) {
      if (!target || !tipEl) return;
      const rect = target.getBoundingClientRect();
      const pad = 10;
      const tipW = tipEl.offsetWidth || 180;
      const tipH = tipEl.offsetHeight || 32;

      let left = rect.left + (rect.width - tipW) / 2;
      left = Math.max(pad, Math.min(left, window.innerWidth - tipW - pad));

      let top = rect.top - tipH - 8;
      if (top < pad) {
        top = rect.bottom + 8;
      }
      if (top + tipH > window.innerHeight - pad) {
        top = Math.max(pad, window.innerHeight - tipH - pad);
      }

      tipEl.style.left = Math.round(left) + 'px';
      tipEl.style.top = Math.round(top) + 'px';
    }

    document.addEventListener('pointerover', function (e) {
      const el = e.target && e.target.closest ? e.target.closest('[title], [data-ra-title]') : null;
      if (!el || el.closest('#cesiumContainer')) return;

      const rawTitle = el.getAttribute('title');
      if (rawTitle && rawTitle.trim() !== '') {
        el.setAttribute('data-ra-title', rawTitle);
        el.removeAttribute('title');
      }

      const text = el.getAttribute('data-ra-title');
      if (!text || text.trim() === '') return;

      if (activeHost === el) return;
      activeHost = el;
      clearTimeout(showTimer);

      showTimer = setTimeout(() => {
        if (activeHost !== el) return;
        tipEl.textContent = text;
        positionTip(el);
        tipEl.classList.add('visible');
      }, 260);
    }, { passive: true });

    document.addEventListener('pointerout', function (e) {
      if (!activeHost) return;
      const rel = e.relatedTarget;
      if (!rel || !activeHost.contains(rel)) {
        hideTip();
      }
    }, { passive: true });

    document.addEventListener('pointerdown', hideTip, { passive: true });
    document.addEventListener('scroll', hideTip, { capture: true, passive: true });
    document.addEventListener('keydown', hideTip, { passive: true });
  }

  function init() {
    decorateExistingCards(document);
    setupRippleHandler();
    setupSpotlightTracker();
    setupVisibilityAndKpiObservers();
    setupWorkflowHook();
    setupGrandEntrance();
    setupModalFocusIsolation();
    setupGlobalLightTooltips();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.RAUIMotion = {
    animateContainerEntrance,
    decorateExistingCards,
    triggerAppReveal,
    syncModalOpenClass
  };
})(typeof window !== 'undefined' ? window : this);
