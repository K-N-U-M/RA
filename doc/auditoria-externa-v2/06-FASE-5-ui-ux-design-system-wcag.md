# FASE 5 (Auditoría Externa v2) — UI/UX, Design System y Accesibilidad WCAG 2.2 AA

> **Objetivo:** Cerrar todas las brechas WCAG 2.2 AA restantes, unificar los >18 sistemas de botones y 2.455 estilos inline, corregir desbordamientos móviles y elevar la ergonomía comercial.  
> **Protocolo para IAs:** Ver [00-INDICE.md](./00-INDICE.md) y registrar cierre en [99-REGISTRO-AVANCES.md](./99-REGISTRO-AVANCES.md).

---

## Tabla de Tickets — Fase 5

| ID | Título | Sev. | Esf. | Dependencias | Estado |
| :--- | :--- | :---: | :---: | :--- | :---: |
| **V2-F5-01** | Completar semántica ARIA en Command Palette (`combobox`/`option`), Drawer Tabs, Catálogo, Studio y Stepper | P0 | M | — | `[Pendiente]` |
| **V2-F5-02** | Corregir contrastes AA (`#047857`/`#94A3B8`), `Escape` en Drawer/Settings, `aria-live` y capas `z-index` | P1 | M | — | `[Pendiente]` |
| **V2-F5-03** | Resolver desbordamientos móvil/portátil (Auditor, Costes, Solar HUD), `<label for>` reales y escala `>= 11px` | P1 | M | — | `[Pendiente]` |
| **V2-F5-04** | Unificar >18 sistemas de botones y 2.455 `style=` inline en Design System + erradicar `outline:none` inline | P1 | XL | V2-F5-02 | `[Pendiente]` |
| **V2-F5-05** | Divulgación progresiva real (Modo Comercial), onboarding Paso 1 y Studio Live Preview escalado A4 | P2 | L | V2-F0-09, V2-F5-04 | `[Pendiente]` |

---

### `V2-F5-01` — Semántica ARIA Completa en Controles Compuestos (WCAG 4.1.2)
- **Estado:** `[Pendiente]`
- **Evidencia:**
  - Command Palette (`js/ux-aaa-workspace.js:148,185-188,203-214`): `#ra-cmd-palette-list` tiene `role="listbox"` pero sus `<button>` hijos carecen de `role="option"`/`aria-selected`; el `<input>` omite `role="combobox"`, `aria-controls`, `aria-expanded` y `aria-activedescendant`, y las flechas reconstruyen `innerHTML` sin `scrollIntoView()`.
  - Drawer Tabs (`js/ux-aaa-workspace.js:304-319`): omiten `aria-controls`, `role="tabpanel"` en `#ra-drawer-body`, roving `tabindex` y navegación `ArrowLeft`/`ArrowRight`; además `PROJECT_UPDATED` (`:826`) re-renderiza todo `body.innerHTML` perdiendo el foco activo.
  - Grupos sin marcar: pestañas Catálogo (`index.html:2730-2745`), Studio (`js/proposal-style-studio.js:1735-1776`), Auditor (`js/bill-auditor.js:1048-1058`), Solar/Eólica (`index.html:1192-1195`) y Stepper (`index.html:459-480` sin `aria-current="step"`).
- **Plan:** Implementar controlador compartido de tabs/listbox ARIA con roving tabindex, `aria-activedescendant`, preservación de foco y `aria-current="step"`.
- **Criterios de aceptación:** Navegación completa por flechas/Tab/Escape en Command Palette, Drawer y todos los juegos de pestañas sin pérdida de foco.

### `V2-F5-02` — Contrastes AA, Cierre `Escape`, Regiones `aria-live` y Apilado `z-index`
- **Estado:** `[Pendiente]`
- **Evidencia:**
  - **Contrastes `< 4.5:1`:** `#FFFFFF` s/ `#10B981` (2,54:1 en `index.html:254`, `proposal-style-studio.js:1762`); `#FFFFFF` s/ `#059669` (3,77:1 en `styles.css:3658`, `a11y-dialogs.js:414`, `ux-aaa-workspace.js:379,528,652` — frente a `--emerald-600: #047857` 5,48:1); `#FFFFFF` s/ `#0EA5E9` (2,73:1 en `index.html:3989,4034,4062`); `#64748B` s/ `#0F172A` (3,89:1 en `index.html:1426,1931,4020,4043,4080`, `styles.css:2093`, `ui-outliner.js:926`, `mppt-matrix-controller.js:1047`, `wind-ui.js:1220`); `rgba(255,255,255,0.4..0.6)` en `bill-auditor.js:1052-1318`.
  - **Teclado/Live:** Engineering Drawer (`ux-aaa-workspace.js:297-320`) sin `Escape` ni alternativo teclado en `#ra-drawer-resizer` (`role="separator"`); `#ra-floating-settings-popover` (`index.html:3932`, `ui-viewport-controls.js:347-373,694`) sin `Escape` ni `aria-expanded`; `#ra-toast-container` (`index.html:3929`) y `#ra-status` (`:280`) sin `role="status"` / `aria-live="polite"`.
  - **Apilado:** `#ra-hud-energy` fija `z-index:100` inline (`index.html:158`) atrapando su tooltip debajo de sidebar/outliner; `#ra-floating-settings-popover` usa `--z-floating: 200` (`styles.css:3136`) permitiendo que paneles arrastrables (`205..289`) lo tapen.
- **Plan:** Sustituir fondos esmeralda por `#047857`, muted oscuro por `>= #94A3B8`, añadir `Escape`/`aria-live`, subir Settings a `--z-popover: 300` y retirar el contexto bloqueante inline de `#ra-hud-energy`.
- **Criterios de aceptación:** Contraste `>= 4.5:1` en toda la UI, lectores de pantalla anuncian toasts y cero solapes z-index en popovers/tooltips.

### `V2-F5-03` — Responsive Móvil, `<label for>` Explícitos y Escala `>= 11px`
- **Estado:** `[Pendiente]`
- **Evidencia:** `#ra-bill-auditor-modal` (`bill-auditor.js:1037`) y `#ra-cost-breakdown-modal` (`index.html:3144`) fijan grillas 2 columnas inline sin colapso en `<= 768px`; `#ra-solar-time-hud` fuerza `min-width: 440px !important` en `@media (max-height: 780px)` (`styles.css:3393`) desbordando móviles verticales; inputs sin `<label for>` en `#ra-cost-breakdown-modal` (`index.html:3161`), `bill-auditor.js:1119-1201` y `mppt-matrix-controller.js:1076-1113`; atributo duplicado `data-sort-col="brand_model"` en `index.html:2755`; `font-size: 8px..10px` en Live Split Preview (`proposal-style-studio.js:1841-1869`) y rosa eólica (`wind-ui.js:117-120`).
- **Plan:** Mover grillas modales a clases responsive `.ra-modal-grid-2`, limitar `min-width` solar HUD con `min(440px, calc(100vw - 24px))`, añadir `<label>`/`aria-label` explícitos, quitar atributo duplicado y fijar mínimo `11px` en UI web.
- **Criterios de aceptación:** Cero scroll horizontal en `375px` y `1280×720`, 0 inputs sin etiqueta semántica y tipografía UI `>= 11px`.

### `V2-F5-04` — Consolidación de Design System (Botones y Estilos Inline)
- **Estado:** `[Pendiente]`
- **Evidencia:** 18+ sistemas de botones compitiendo en `css/styles.css`, **2.455 líneas con `style=` inline** (`index.html`: 1.480; `proposal-style-studio.js`: 461; `wind-ui.js`: 178; `bill-auditor.js`: 147; `ux-aaa-workspace.js`: 97; `mppt-matrix-controller.js`: 61) y 40+ `outline:none` inline.
- **Plan:** Definir primitivas unificadas (`ra-btn --primary/--secondary/--ghost/--danger`, `ra-input`, `ra-card`, `ra-badge`) sobre `:root` y migrar progresivamente estilos y botones heredados eliminando todo `outline:none` inline.
- **Criterios de aceptación:** Reducción >70 % de estilos inline en `index.html` y módulos UI principales con lenguaje visual único.

### `V2-F5-05` — UX AAA: Modo Comercial Real, Onboarding Paso 1 y Studio Live Preview Escalado
- **Estado:** `[Pendiente]`
- **Evidencia:** Modo Comercial (`css/styles.css:3441-3445`) solo oculta 3 tarjetas (2 de ellas inexistentes) dejando expuestas las 8 pestañas técnicas del Drawer; nuevos usuarios aterrizan sin guía en Paso 1; `buildLiveSplitPreviewHTML()` (`proposal-style-studio.js:1794-1875`) es una miniatura estática vertical y desaparece por completo bajo `960px` (`css/styles.css:3628`).
- **Plan:** Agrupar pestañas del Drawer por dominio y colapsar ajustes REBT/CAD avanzados en Comercial; añadir checklist guiado auto-verificable en Paso 1; convertir Studio Preview en hoja A4 escalada vía `transform: scale(...)` con selector Vertical/Horizontal y pestaña móvil `< 960px`.
- **Criterios de aceptación:** Vista Comercial limpia para cliente final, primer usuario guiado en 3 clics y previsualización fiel tanto Vertical como Horizontal en cualquier pantalla.
