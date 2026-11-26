# 🟢 FASE 5: UI/UX y Funcionalidades de Nivel AAA

> **Objetivo:** Llevar la experiencia de usuario al estándar de Aurora Solar / HelioScope / PVsyst con accesibilidad completa, diseño sin solapamientos y herramientas profesionales de decisión.

---

## Tareas

### 5.1. Ordenar capas CSS (`--z-*`) y unificar títulos de pasos
- **Evidencia:** `css/styles.css` mezcla `z-index` ad-hoc (`99999`, `2000000 !important`, `100005 !important`) con riesgo de solapamiento en `<= 768px`. Además, `index.html:518` y `js/workflow-orchestrator.js:35` usan títulos distintos para el Paso 3.
- **Acción:** Definir tokens `--z-hud`, `--z-sidebar`, `--z-floating-panel`, `--z-modal`, `--z-toast` y unificar nomenclatura de los 5 pasos.

### 5.2. Accesibilidad (a11y) y estado inicial de Sidebar
- **Evidencia:** `index.html:463` inicia `<aside id="ra-sidebar" class="collapsed">` en escritorio; `index.html:498, 543, 685` y `js/ui-outliner.js:36, 180, 193, 218` usan `div`/`span` clicables sin soporte de teclado (`Enter`/`Space`).
- **Acción:** Expandir sidebar por defecto en `> 1024px`, usar `<button type="button">` nativos o añadir manejadores de teclado y `aria-expanded`.

### 5.3. Barra de Estado CAD inferior (Status Bar)
- **Propuesta AAA:** Mostrar en tiempo real coordenadas XYZ/ENU, pendiente del faldón activo, estado del snap y atajos contextuales (`Esc`, `Ctrl+Z`, `M`).

### 5.4. Comparador de Escenarios A/B (Pasos 3–5)
- **Propuesta AAA:** Permitir guardar 2 variantes (ej. *Solo FV* vs *FV + Batería*) y comparar kWp, autoconsumo, VAN y TIR lado a lado en la oferta comercial.

### 5.5. Gráfico en vivo de Ventana MPPT / Curva I-V (Paso 4)
- **Propuesta AAA:** Visualizar `Voc` a `-10 °C` y `Vmpp` a `70 °C` frente a la ventana MPPT del inversor seleccionado (IEC 62548).

### 5.6. Autosave silencioso en IndexedDB + Onboarding Empty State
- **Propuesta AAA:** Snapshot automático cada 60 s en IndexedDB para recuperación tras cierre accidental, y tarjeta de bienvenida en 3 acciones (*Buscar dirección*, *Dibujar cubierta*, *Abrir demo*) cuando la escena está vacía.

---

## Checklist de Avance
- [x] 5.1. Tokens `--z-*` y títulos unificados
- [x] 5.2. Sidebar desktop expandida + a11y teclado
- [x] 5.3. Status Bar CAD inferior
- [x] 5.4. Comparador de escenarios A/B
- [x] 5.5. Gráfico ventana MPPT en vivo
- [x] 5.6. Autosave IndexedDB + Onboarding Empty State

## Registro de Avances
- **2026-11-26 (2 Agentes en paralelo):** Completadas tareas 5.1 (tokens `--z-*` y título Paso 3), 5.2 (sidebar expandida en `>1024px` + a11y teclado), 5.3 (`js/cad-status-bar.js`) y 5.6 parte Autosave (`js/autosave-idb.js`). Verificado con `node tests/test-js-syntax.js` (83/83 OK).
- **2026-11-26 (2 Agentes en paralelo):** Completadas tareas 5.4 (`js/scenario-comparator.js`), 5.5 (`js/mppt-window-chart.js`) y 5.6 parte Onboarding (`js/onboarding-empty.js`). Verificado con `node tests/test-js-syntax.js` (86/86 OK).
