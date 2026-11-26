# 🟢 FASE 5: Rediseño Visual AAA, Accesibilidad WCAG 2.2 y UX Moderna

> **Objetivo:** Transformar la interfaz en un producto de diseño industrial nivel AAA (referencias: Aurora Solar, Linear, Figma, Blender), corrigiendo corrupción HTML/WCAG, eliminando 1.514 estilos inline y 331 `!important`, consolidando controles duplicados y unificando el workspace en 3 zonas limpias.

---

## 5.A. Base YA Implementada (Mantener y Evolucionar)
- [x] Tokens iniciales `--z-*` definidos en `:root` (`css/styles.css:52-56`) y título Paso 3 unificado.
- [x] Sidebar expandida por defecto en `>1024px` + listener de teclado `Enter`/`Space` en `[role="button"]`.
- [x] Módulos creados: `js/cad-status-bar.js`, `js/autosave-idb.js`, `js/scenario-comparator.js`, `js/mppt-window-chart.js`, `js/onboarding-empty.js`.

---

## 5.B. Tareas Quirúrgicas de Reparación y Rediseño Visual AAA

### 5.1. Reparar Corrupción WCAG 2.2, `aria-label` Volcados y Tokens CSS Fantasma
- **Evidencia:**
  1. `css/styles.css:2374-2376` anula el anillo de foco globalmente con `outline: none !important;` sobre `:focus-visible`.
  2. **6 atributos `aria-label` corruptos** con volcados de ~3.000 caracteres de texto del DOM y fragmentos JS (`index.html:1548, 1725, 2870, 3012, 3129, 3703`) + **6 `<label for="...">` apuntando a IDs erróneos** (`index.html:862, 1556, 1809, 2980, 3113, 3315`).
  3. **8 tokens CSS inexistentes** referenciados en HTML/CSS (`--sky-300/400/500`, `--cyan-400`, `--emerald-400`, `--blue-400`, `--rose-400`, `--amber-300`, `--text-slate-200`) dejando botones sin color o contraste en `index.html:484, 490, 701-704, 920, 1012, 4073`.
  4. **Fondo destructivo de sidebar (`css/styles.css:401`):** gradiente hasta `rgb(200, 200, 200)` que destruye el contraste de textos claros en la mitad inferior.
  5. **Texto roto/interno en UI:** LaTeX sin renderizar y escape roto (`index.html:756` `$H$`, `L907` `$\theta$` convertido en tabulador + `heta$`), stamps `DEPLOY: 2026-11-24...` (`L2762, L4021`), `@keyframes fadeIn`/`pulse` sin definir (`L1751, L3913`).
- **Solución:** Restaurar `:focus-visible` con anillo `--sky-400`, limpiar los 6 `aria-label` y `<label for>`, completar todos los tokens semánticos en `:root`, sustituir el fondo de `#ra-sidebar` por superficie oscura sólida/glass (`rgba(11, 17, 32, 0.94)`), quitar LaTeX crudo/stamps de debug y definir las animaciones faltantes.
- **Aceptación:** Cero `aria-label` >120 chars, contraste WCAG AA/AAA >= 4.5:1 en toda la sidebar y foco visible al tabular.

### 5.2. Sistema de Diseño Unificado: Adiós a 1.514 `style="..."`, 331 `!important` y Micro-Fuentes
- **Evidencia:**
  - `1.514` atributos `style="..."` inline en `index.html` + HTML strings en `financials.js`, `docs-generator.js`, `cad-status-bar.js`, `onboarding-empty.js`.
  - `331` `!important` y reglas definidas hasta 3 veces (`#wp-step2-gen-tabs` en `index.html:130`, `L1241`, `css/styles.css:3114`; `.solar-mode-btn` duplicada en `css/styles.css:1967` vs `2209`).
  - **18 tamaños de fuente arbitrarios** (`8px–26px`) con botones/formularios a `8px–9.5px` (`index.html:1476, 1681, 1710`, `financials.js:1579`) mientras badges secundarios miden `14px`.
  - Mezcla de 4 sistemas de iconos (Lucide + SVGs inline + decenas de emojis `🐸`, `⛓️`, `🙈`, `👁️`, `🗑️`).
- **Solución:**
  - Aplicar escala tipográfica de 5 pasos (`11px, 12px, 13px, 14px, 16px` con `tabular-nums`, prohibido `< 11px`), unificar fuentes (`--font-sans` Inter + `--font-mono` JetBrains Mono).
  - Reemplazar todos los emojis funcionales por iconos Lucide SVG homogéneos.
  - Migrar estilos inline y duplicados a clases limpias en `css/styles.css` y aplicar los tokens `--z-*` en **todos** los overlays/modales (erradicando los `z-index: 99999` / `2000000 !important`).
- **Aceptación:** <50 estilos inline dinámicos, 0 `!important` en componentes, 0 emojis funcionales en UI y jerarquía `z-index` estricta.

### 5.3. Rediseño del Workspace CAD (3 Zonas Sin Solapamientos) y Consolidación de Duplicados
- **Evidencia de saturación y colisiones:**
  - **Colisiones en viewport:** `#ra-cad-status-bar` (`z:900`) tapado por `#ra-onboarding-empty-card` (`z:950`) y `#ra-solar-time-hud` (`z:1000`); `#ra-btn-compare-scenarios` colisiona con `#ra-floating-settings-btn` y su popover; `#ra-hud-energy` (`z:100`) choca con `#ra-project-status-hud` (`z:9400`); `#ra-bom-tree-hud` y `#ra-cad-outliner-panel` flotan encima de los 3 FABs derechos; 7 píldoras de `#ra-floating-tools-container` (~820 px) chocan con sidebar en ≤1280 px.
  - **Duplicación funcional en UI:** 2 HUDs de energía, 2 Comparadores de Escenarios (`wpCompararEscenarios` vs `scenario-comparator.js`), 2 Modales gigantes de Costes (`#ra-cost-breakdown-modal` 472 líneas vs `#ra-pricing-review-modal`), datos de cliente/CUPS en 3 sitios, 2 botones `RESET MALLA` / `RESTAURAR MALLA` en la misma tarjeta, 3 triggers a `wpOpenSmartInverterMatchingModal`, 2 botones de cables, 6 botones PDF duplicados en Paso 5 y `#ra-doc-modal`, 2 árboles flotantes (`Outliner` + `BOM`).
- **Solución (Layout AAA estilo Linear / Aurora / Blender):**
  1. **Top Bar (44 px):** Stepper horizontal de 5 pasos + **único HUD compacto de proyecto** + archivo/catálogo. Quitar `pointer-events: none` de `.wp-step-btn.disabled` (`css/styles.css:208`) para que al pulsar un paso bloqueado muestre el motivo exacto.
  2. **Sidebar Izquierda (320 px):** Pestañas `[Flujo 1–5 | Escena Outliner]`. En Paso 1, segmented control `Fotogrametría (Plano 3P)` vs `Modelar Edificio 3D`; en Paso 2, dividir `#faldon-edit-card` (330 líneas) en `Básico` + acordeón `Avanzado`.
  3. **Inspector Contextual Derecho (300 px, bajo demanda):** Propiedades del objeto seleccionado + pestaña `BOM` + comparador unificado.
  4. **Dock Flotante Inferior Único + Status Bar 24 px:** Una única barra centrada de iconos (`40×40 px`) con tooltips de atajos reales + barra de estado de 24 px pegada al borde inferior sin solaparse con el onboarding.
  5. **Unificar Modales:** Fusionar `#ra-cost-breakdown-modal` + `#ra-pricing-review-modal` en 1 modal con 4 tabs; consolidar los 2 comparadores; dejar `#ra-doc-modal` solo para datos de promotor sin repetir los 6 botones PDF; incluir `#ra-scenario-comparator-modal` y `#ra-embedded-doc-modal` en `closeAnyActiveModal` (`ui-viewport-controls.js:379-387`).
- **Aceptación:** 0 solapamientos a `1280×720` y `1920×1080`, 1 único flujo sin botones ni modales repetidos.

### 5.4. Reparación Responsive Móvil / Tablet (`<= 768px`)
- **Evidencia:**
  - `#ra-mobile-sidebar-backdrop` referido en CSS (`L2716`) y JS (`ui-viewport-controls.js:713`, `app-main.js:4737`) pero inexistente en `index.html`.
  - `css/styles.css:3021-3039` colapsa solo 3 de los 7 botones de `#ra-floating-tools-container`; los otros 4 desbordan la pantalla móvil.
  - `#ra-scenario-comparator-modal` (`z-index: 99990`) queda debajo del sidebar móvil (`z-index: 100000 !important`).
  - `#ra-cost-breakdown-modal` y `#ra-pricing-review-modal` tienen grids fijos de 2 columnas sin `@media (max-width: 768px)`.
- **Solución:** Añadir `#ra-mobile-sidebar-backdrop` al DOM, colapsar/agrupar los 7 botones de herramientas en móvil, ocultar `#ra-btn-compare-scenarios` y `#ra-cad-status-bar` con `body.sb-open`, pasar modales a 1 columna en `<= 768px` y usar `--z-modal > --z-sidebar`.
- **Aceptación:** Cero desbordamiento horizontal en `375×812` y `768×1024`; todos los modales visibles sobre el drawer.

---

## Checklist de Avance
- [ ] 5.1. Corregidos `aria-label`, `<label for>`, foco WCAG, tokens CSS fantasma, fondo sidebar y LaTeX/stamps
- [ ] 5.2. Escala tipográfica (`11–16px`), 100% iconos Lucide, extracción de inline styles y `--z-*` aplicado
- [ ] 5.3. Workspace AAA 3 zonas, stepper clickable con feedback y consolidación de HUDs/modales/botones duplicados
- [ ] 5.4. Responsive móvil/tablet real (`<= 768px`) sin desbordes ni modales ocultos

## Registro de Avances
- **2026-11-26 (Fase 5 inicial):** Añadidos tokens `--z-*` base, sidebar expandida en escritorio, a11y teclado básica y módulos `cad-status-bar.js`, `autosave-idb.js`, `scenario-comparator.js`, `mppt-window-chart.js`, `onboarding-empty.js`.
- **2026-11-26 (Auditoría Quirúrgica):** Detectados 6 `aria-label` corruptos, `outline: none !important`, 8 tokens CSS indefinidos, 1.514 `style="..."`, 331 `!important`, fondo claro roto en sidebar, colisiones en viewport, duplicidad de HUDs/modales/comparadores y fallos en móvil.
