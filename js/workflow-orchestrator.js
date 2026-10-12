/**
 * ============================================================================
 * 🎮 WORKFLOW ORCHESTRATOR (Orquestador Central de Estados del Flujo Solar)
 * ============================================================================
 * Arquitectura: Finite State Machine (FSM) + Event Bus (Patrón Mediator AAA)
 * Rol: Centraliza las transiciones de estado, validación de prerrequisitos
 *      (guards) y sincronización reactiva entre módulos (3D, HUD, Outliner).
 * ============================================================================
 */

(function (global) {
  'use strict';

  // Definición canónica de los 5 pasos de ingeniería fotovoltaica (v3.0)
  const STEP_DEFINITIONS = {
    1: {
      id: 1,
      key: 'emplacement',
      name: 'Emplazamiento',
      phase: 'FASE I · EMPLAZAMIENTO',
      title: 'Paso 1: Emplazamiento — Plano, Faldones & Obstáculos',
      minPrerequisite: 'none'
    },
    2: {
      id: 2,
      key: 'field',
      name: 'Campo Solar',
      phase: 'FASE II · CAMPO SOLAR',
      title: 'Paso 2: Campo Solar - Módulos FV, Disposición & Orientación',
      minPrerequisite: 'roof'
    },
    3: {
      id: 3,
      key: 'analysis',
      name: 'Análisis Solar & Demanda',
      phase: 'FASE III · ANÁLISIS SOLAR',
      title: 'Paso 3: Análisis Solar - Sombras 3D, Heatmap & Factura',
      minPrerequisite: 'panels'
    },
    4: {
      id: 4,
      key: 'engineering',
      name: 'Ingeniería',
      phase: 'FASE IV · INGENIERÍA ELÉCTRICA',
      title: 'Paso 4: Ingeniería — Inversores, Baterías y Cableado',
      minPrerequisite: 'panels'
    },
    5: {
      id: 5,
      key: 'delivery',
      name: 'Entrega',
      phase: 'FASE V · ENTREGA & MEMORIA',
      title: 'Paso 5: Entrega — Viabilidad, Presupuesto & Memoria PDF',
      minPrerequisite: 'inverter'
    }
  };

  class WorkflowOrchestrator {
    constructor() {
      this._currentStep = 1;
      this._listeners = new Map();
      this._bypassGating = false;

      // Inicialización reactiva tras carga del DOM
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this._init());
      } else {
        this._init();
      }
    }

    /**
     * Inicialización del orquestador y vinculación con la interfaz
     */
    _init() {
      // Suscripción al Scene Graph si ya está disponible
      if (global.ProjectHierarchy && typeof global.ProjectHierarchy.subscribe === 'function') {
        global.ProjectHierarchy.subscribe(() => this.refreshGating());
      }
      this.refreshGating();
      this.emit('orchestrator_ready', { currentStep: this._currentStep });
    }

    /**
     * Sistema Event Bus: Suscripción a eventos
     */
    on(event, callback) {
      if (typeof callback !== 'function') return;
      if (!this._listeners.has(event)) {
        this._listeners.set(event, new Set());
      }
      this._listeners.get(event).add(callback);
    }

    /**
     * Sistema Event Bus: Cancelación de suscripción
     */
    off(event, callback) {
      if (this._listeners.has(event)) {
        this._listeners.get(event).delete(callback);
      }
    }

    /**
     * Sistema Event Bus: Emisión de eventos reactivos
     */
    emit(event, data) {
      if (this._listeners.has(event)) {
        this._listeners.get(event).forEach(cb => {
          try {
            cb(data);
          } catch (err) {
            console.error(`[WorkflowOrchestrator] Error en listener para evento '${event}':`, err);
          }
        });
      }
    }

    /**
     * Comprueba si la escena dispone de un plano de trabajo activo
     */
    hasActivePlane() {
      if (global.WP && Array.isArray(global.WP.planes)) {
        return global.WP.planes.length > 0;
      }
      return false;
    }

    /**
     * Comprueba si la escena dispone de al menos un faldón o polilínea cerrada
     */
    hasRoofPolylines() {
      if (global.WP && Array.isArray(global.WP.polylines)) {
        return global.WP.polylines.some(p => p && Array.isArray(p.points) && p.points.length >= 3);
      }
      return false;
    }

    /**
     * Comprueba si se ha generado un campo de paneles fotovoltaicos
     */
    hasGeneratedPanels() {
      if (global.WP && Array.isArray(global.WP.polylines)) {
        const hasPolyPanels = global.WP.polylines.some(p => p && Array.isArray(p.panels) && p.panels.length > 0);
        if (hasPolyPanels) return true;
      }
      if (global.WP && Array.isArray(global.WP.panelPool) && global.WP.panelPool.length > 0) {
        return true;
      }
      if (global.simulatedPanelsPrimitive != null) {
        return true;
      }
      // NOTA: isPolygonDesignConfirmed ya NO cuenta como prueba de paneles.
      // Ese flag significa "el usuario pasó por Campo Solar", no "hay layout generado";
      // aceptarlo permitía saltar al Paso 3/4/5 con 0 paneles.
      return false;
    }

    /**
     * Validador de transición (Guard Condition)
     * Retorna { allowed: boolean, reason?: string }
     */
    canEnterStep(targetStep) {
      if (this._bypassGating) return { allowed: true };
      
      const step = parseInt(targetStep, 10);
      if (isNaN(step) || step < 1 || step > 5) {
        return { allowed: false, reason: 'Paso desconocido' };
      }

      const hasPlane = this.hasActivePlane();
      const hasPolys = this.hasRoofPolylines();
      const hasPanels = this.hasGeneratedPanels();

      if (step === 2) {
        if (!hasPolys) {
          return {
            allowed: false,
            reason: 'Requiere trazar al menos un faldón de cubierta en el Paso 1 (Emplazamiento)'
          };
        }
      } else if (step === 3 || step === 4) {
        if (!hasPanels) {
          return {
            allowed: false,
            reason: 'Requiere generar la malla de módulos fotovoltaicos en el Paso 2 (Campo Solar)'
          };
        }
      } else if (step === 5) {
        if (!hasPanels) {
          return {
            allowed: false,
            reason: 'Requiere completar el diseño solar en los pasos anteriores'
          };
        }
        // minPrerequisite: 'inverter' — el presupuesto/memoria exigen inversor del catálogo
        const cfg = global.solarProjectConfig;
        const hasInverter = !!(cfg && cfg.selectedInverterId);
        if (!hasInverter) {
          return {
            allowed: false,
            reason: 'Requiere seleccionar un inversor del catálogo en el Paso 4 (Ingeniería)'
          };
        }
      }

      return { allowed: true };
    }

    /**
     * Transición de estado con validación formal
     * @param {number} targetStep 
     * @param {boolean} [force=false]
     * @returns {boolean} True si la transición fue admitida
     */
    goToStep(targetStep, force = false) {
      const step = parseInt(targetStep, 10);
      const check = force ? { allowed: true } : this.canEnterStep(step);

      if (!check.allowed) {
        if (typeof global.showToast === 'function') {
          global.showToast('PASO BLOQUEADO', check.reason || 'Completa los pasos previos requeridos', 'warning', 2800);
        }
        this.emit('step_blocked', { from: this._currentStep, to: step, reason: check.reason });
        return false;
      }

      const previousStep = this._currentStep;
      this.emit('before_step_change', { from: previousStep, to: step });

      // [P0] Aviso al entrar en Paso 3 si el mapa de calor quedó invalidado por cambios de geometría
      if (step === 3 && global.solarSimState && global.solarSimState.annualHeatmapDirty && typeof global.showToast === 'function') {
        global.showToast('ANÁLISIS SOLAR OBSOLETO', 'La geometría, los obstáculos o el módulo han cambiado desde el último cálculo. Recalcula el mapa de calor para actualizar pérdidas y producción.', 'warning', 5000);
      }

      this._currentStep = step;

      // Actualizar estado del Stepper HUD
      this.refreshGating();

      this.emit('step_changed', {
        step: this._currentStep,
        previousStep: previousStep,
        def: STEP_DEFINITIONS[this._currentStep]
      });

      return true;
    }

    /**
     * Actualiza el estado visual enabled/disabled de los botones del Stepper
     */
    refreshGating() {
      for (let s = 1; s <= 5; s++) {
        const btn = document.getElementById('wp-step-' + s + '-btn');
        if (!btn) continue;

        const check = this.canEnterStep(s);
        if (check.allowed) {
          btn.classList.remove('disabled');
          btn.removeAttribute('title');
        } else {
          btn.classList.add('disabled');
          btn.title = check.reason || 'Paso bloqueado';
        }

        // Sincronizar clase activa
        btn.classList.toggle('active', s === this._currentStep);
      }
    }

    /**
     * Retorna el paso actual
     */
    getCurrentStep() {
      return this._currentStep;
    }

    /**
     * Retorna la definición completa del paso actual o del indicado
     */
    getStepDefinition(stepNumber) {
      const s = stepNumber || this._currentStep;
      return STEP_DEFINITIONS[s] ? { ...STEP_DEFINITIONS[s] } : null;
    }

    /**
     * Modo desarrollador: Permite saltarse los bloqueos para pruebas
     */
    setBypassGating(enabled) {
      this._bypassGating = Boolean(enabled);
      this.refreshGating();
      console.log(`[WorkflowOrchestrator] Bypass gating: ${this._bypassGating}`);
    }
  }

  // Singleton global exportado en window
  global.WorkflowOrchestrator = new WorkflowOrchestrator();

})(typeof window !== 'undefined' ? window : this);
