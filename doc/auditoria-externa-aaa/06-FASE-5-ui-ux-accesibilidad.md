# FASE 5 — Interfaz de Usuario (UI/UX), Design System y Accesibilidad WCAG 2.2 AA

> **Objetivo de la fase:** Corregir los bloqueos graves de accesibilidad y usabilidad (`Tab` capturado por 3D, cierre de `Escape` roto en modales superpuestos, `outline: none`, `aria-label` corruptos, **993** textos `< 11px`, contrastes insuficientes, desborde móvil/portátil) e implantar un Design System coherente con tokens CSS reales.
> **Prerrequisitos recomendados:** Idealmente coordinado tras limpiar código muerto/CSS muerto (Fase 3), aunque los tickets **P0 (`F5-01..F5-03`)** pueden aplicarse en paralelo de inmediato.
> **Protocolo para IAs:** Consulta [00-INDICE.md](./00-INDICE.md) y anota cada cierre en [99-REGISTRO-AVANCES.md](./99-REGISTRO-AVANCES.md).

---

## Métricas Baseline Verificadas

- **Estilos inline `style="..."`:** **2.640** ocurrencias (`index.html`: **1.514**, 13 módulos UI JS: **1.126**, destacando `proposal-style-studio.js`: 451, `wind-ui.js`: 202, `bill-auditor.js`: 147, `working-plane.js`: 125).
- **Tokens CSS rotos / Hardcodeo:** **32** variables en `:root` (con `--text-slate-400` duplicada), **9 variables CSS indefinidas** usadas **72 veces** en `index.html`/`styles.css`, frente a **569** colores hardcodeados en `styles.css` y **1.178** en `index.html`.
- **Microtipografía `< 11px`:** **993** declaraciones (`index.html` 632, hasta `8px` en matrices MPPT, wind, billing y style studio).
- **`z-index >= 1000`:** **38** literales dispersos (`950` hasta `2.000.000`, con 7 elementos empatando en `999999`).
- **Accesibilidad WCAG 2.2:** `skip-link = 0`, zoom bloqueado en viewport meta, `:focus-visible` anulado en todo el CSS, `0` `<h1>`/`<h2>` en `index.html`, `26/26` `<th>` sin `scope`, `22/125` `<label>` sin `for`, `4` `<label for>` apuntando a inputs equivocados, `6` `aria-label` corruptos (hasta 5.380 chars), **45** `div/span` con `onclick` no semánticos.

---

## Tabla de Tareas — Fase 5

| ID | Título | Severidad | Esfuerzo | Dependencias | Origen | Estado |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| **F5-01** | Liberar tecla `Tab` del ciclado 3D para navegación UI, unificar tooltip `Ctrl+B` y arreglar stack `Escape` modal | P0 | M | Ninguna | E-01 + E-02 | `[Hecho]` |
| **F5-02** | Restaurar `:focus-visible` de alto contraste y desbloquear zoom en `meta viewport` (WCAG AA) | P0 | S | Ninguna | E-03 | `[Hecho]` |
| **F5-03** | Reparar 6 `aria-label` corruptos, 4 `<label for>` cruzados y asociar 22 labels huérfanos | P0 | S | Ninguna | E-04 | `[Hecho]` |
| **F5-04** | Sustituir `prompt()`/`confirm()` nativos y dotar de spinner/bloqueo `aria-busy` a acciones largas | P1 | M | F5-01 | E-05 + E-06 | `[Hecho]` |
| **F5-05** | Desacoplar toggle desktop/móvil de Outliner e implantar escala única de tokens `z-index` (7 niveles) | P1 | M | F5-01 | E-07 | `[Hecho]` |
| **F5-06** | Hacer explicables los pasos bloqueados (`aria-disabled`), añadir footer sticky en Paso 1 y limpiar `#tab-btn-*` | P1 | M | F5-02 | E-08 | `[Hecho]` |
| **F5-07** | Declarar 9 variables CSS faltantes, corregir contrastes AA (`#64748B`, botones, sidebar) y empezar extracción de estilos inline | P1 | XL | Ninguna | E-09 + E-13 | `[Parcial]` |
| **F5-08** | Erradicar microtipografía `< 11px` (993 ocurrencias) fijando escala legible en paneles y modales | P1 | L | F5-07 | E-10 | `[Pendiente]` |
| **F5-09** | Corregir desbordamientos responsive en móvil (`<=768px`) y portátiles (`1280×720` / `1366×768`) | P1 | L | F5-05, F5-07 | E-11 | `[Pendiente]` |
| **F5-10** | Hacer operable `#ra-hud-energy` y tooltips por teclado, eliminar controles anidados, añadir landmarks y arreglar tablas/iconos | P1–P2 | L | F5-02, F5-07 | E-12 + E-14 + E-15 + E-16 | `[Pendiente]` |

---

## Detalle Técnico por Tarea

### `F5-01` — Liberar tecla `Tab` del ciclado 3D para navegación UI, unificar tooltip `Ctrl+B` y arreglar stack `Escape` modal

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Bug UI/UX / Accesibilidad |
| **Severidad** | P0 (Crítico) |
| **Esfuerzo** | M (2–8 horas) |
| **Dependencias** | Ninguna |
| **Origen** | E-01 + E-02 |
| **Rama sugerida** | `fix/ui-tab-navigation-and-modal-escape-stack` |
| **Estado** | `[Hecho]` |

#### Contexto y Problema
1. `cad-selection-suite.js:578-598` captura `Tab` en toda la página en cuanto `_lastHoverX > 0 && _lastHoverY > 0` (basta mover una vez el ratón) para ciclar selección 3D, rompiendo `Tab`/`Shift+Tab` por botones, sidebar y modales. Además `index.html:492` dice `(Tab)` para colapsar sidebar mientras `L468` dice `[Ctrl+B]`.
2. Dos listeners globales de `Escape` compiten: `ui-viewport-controls.js` (cargado antes en `index.html:33`) recorre 7 IDs estáticos sin mirar `z-index`, cierra el modal inferior de fondo cuando hay otro encima (`#ra-async-confirm-modal`, `#ra-proposal-style-studio-modal`, `#ra-pricing-review-modal`), detiene la propagación hacia `a11y-dialogs.js` y no restaura el foco. `#ra-proposal-style-studio-modal` tampoco cierra con clic en backdrop y `#ra-pricing-review-modal` falta en `TOP_MODAL_SELECTOR`.

#### Evidencia Verificada
- `js/cad-selection-suite.js:578-598`, `index.html:468, 492`
- `js/ui-viewport-controls.js:376-400, 568-596`
- `js/a11y-dialogs.js:17-29, 166, 181-232, 378-406`
- `js/proposal-style-studio.js:1677-1684`, `js/financials.js:1402`, `index.html:33, 112`

#### Pasos de Implementación
1. En `js/cad-selection-suite.js:578-598`, mover el ciclado de entidades CAD a la tecla dedicada `Q` (o restringir `Tab` estrictamente a cuando no exista modal/popover abierto y el foco activo sea `#cesiumContainer`/`document.body` con cursor sobre el canvas WebGL), y unificar el tooltip de `index.html:492` a `[Ctrl+B]`.
2. Eliminar `closeAnyActiveModal()` y los listeners de `Escape`/backdrop duplicados de `js/ui-viewport-controls.js:376-400, 568-596`.
3. Centralizar todo stack de modales en `js/a11y-dialogs.js`: añadir `#ra-pricing-review-modal` a `TOP_MODAL_SELECTOR`/`enhanceContainer`, ordenar modales abiertos por `getComputedStyle(el).zIndex` real y DOM order, cerrar solo el superior con `Escape`/backdrop (habilitando backdrop click en `#ra-proposal-style-studio-modal`) y devolver el foco al elemento disparador.

#### Criterios de Aceptación
- Con el ratón tras moverse por la pantalla o con un modal abierto, `Tab` y `Shift+Tab` recorren siempre controles UI en orden lógico.
- Con `#ra-equipment-catalog-modal` y `#ra-async-confirm-modal` abiertos simultáneamente, pulsar `Escape` cierra primero únicamente `#ra-async-confirm-modal` y retorna el foco dentro del catálogo.

---

### `F5-02` — Restaurar `:focus-visible` de alto contraste y desbloquear zoom en `meta viewport` (WCAG AA)

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Accesibilidad WCAG |
| **Severidad** | P0 (Crítico) |
| **Esfuerzo** | S (<2 horas) |
| **Dependencias** | Ninguna |
| **Origen** | E-03 |
| **Rama sugerida** | `fix/wcag-focus-visible-viewport-zoom` |
| **Estado** | `[Hecho]` |

#### Contexto y Problema
`css/styles.css:2367-2369` y `3179` anulan `:focus-visible` globalmente con `outline: none !important`, haciendo invisible la navegación por teclado (viola WCAG 2.4.7 / 2.4.11). Paralelamente, `index.html:5` impone `maximum-scale=1.0, user-scalable=no` impidiendo el zoom táctil/visual (viola WCAG 1.4.4).

#### Evidencia Verificada
- `css/styles.css:2365-2369, 3179`
- `index.html:5`

#### Pasos de Implementación
1. Eliminar los bloques `outline: none !important` sobre `:focus-visible` en `css/styles.css:2367-2369, 3179` y sustituirlos por `outline: 2px solid #38BDF8; outline-offset: 2px; border-radius: 4px;` (o `var(--focus-ring)` de alto contraste >= 3:1 sobre fondos oscuros y claros).
2. Modificar `<meta name="viewport">` en `index.html:5` a `width=device-width, initial-scale=1.0, viewport-fit=cover` retirando `maximum-scale=1.0` y `user-scalable=no`.

#### Criterios de Aceptación
- Navegar con `Tab` muestra anillo de foco visible de contraste `>= 3:1` en botones, pestañas, inputs, enlaces y modales.
- Zoom táctil y zoom navegador funcionan hasta 200%+ sin restricciones.

---

### `F5-03` — Reparar 6 `aria-label` corruptos, 4 `<label for>` cruzados y asociar 22 labels huérfanos

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Accesibilidad WCAG |
| **Severidad** | P0 (Crítico) |
| **Esfuerzo** | S (<2 horas) |
| **Dependencias** | Ninguna |
| **Origen** | E-04 |
| **Rama sugerida** | `fix/wcag-form-labels-and-aria` |
| **Estado** | `[Hecho]` |

#### Contexto y Problema
Un script anterior dejó **6** `aria-label` gigantes de 144 hasta **5.380 caracteres** con volcados de HTML y código JS (`showToast`, pasos 3–5), **4** `<label for>` apuntan a inputs equivocados de otros formularios, y **22/125** `<label>` en `index.html` (plus plantillas JS) carecen de `for`. Además `a11y-dialogs.js:120` ignora controles que ya tengan algún `aria-label`.

#### Evidencia Verificada
- `index.html:857-858, 1543, 1551-1552, 1720, 1804-1805, 2865, 3007, 3124, 3310-3311, 3698`
- `js/wind/wind-ui.js:564, 568`, `js/financials.js:1438-1470`, `js/a11y-dialogs.js:101-134`

#### Pasos de Implementación
1. Reemplazar los 6 `aria-label` corruptos de `index.html` (`1543`, `1720`, `2865`, `3007`, `3124`, `3698`) por textos limpios y cortos o eliminarlos donde exista `<label for>` visible.
2. Corregir los 4 `for` cruzados (`857`, `1551`, `1804`, `3310`) vinculando el `id` exacto del input contenido en cada etiqueta.
3. Añadir `for="..."` explícito a los 22 `<label>` sin asociar en `index.html` y a los inputs generados en `wind-ui.js` y `financials.js`. En `a11y-dialogs.js:120`, añadir salvaguarda para corregir automáticamente labels corruptos >120 chars si existiesen.

#### Criterios de Aceptación
- Ningún `aria-label` en el DOM supera los 80 caracteres.
- Hacer clic sobre cada `<label>` enfoca/conmuta exclusivamente el campo asociado.

---

### `F5-04` — Sustituir `prompt()`/`confirm()` nativos y dotar de spinner/bloqueo `aria-busy` a acciones largas

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Bug UI/UX |
| **Severidad** | P1 (Alto) |
| **Esfuerzo** | M (2–8 horas) |
| **Dependencias** | F5-01 |
| **Origen** | E-05 + E-06 |
| **Rama sugerida** | `fix/ui-async-dialogs-and-loading-states` |
| **Estado** | `[Hecho]` |

#### Contexto y Problema
Permanecen llamadas bloqueantes `prompt()`/`confirm()` en `proposal-style-studio.js:2921`, `wind-ui.js:787` y `wind-catalog.js:694` que congelan WebGL y rompen el tema oscuro. Además, las operaciones pesadas (exportar ZIP `generateDeliveryPack`, PDF `wpDownloadSelectedProposal`, `wpCompararEscenarios`, análisis de factura IA y raytracing de heatmap) dejan habilitado el botón permitiendo envíos concurrentes duplicados.

#### Evidencia Verificada
- `js/proposal-style-studio.js:2921`, `js/wind/wind-ui.js:787`, `js/wind/wind-catalog.js:694`, `js/a11y-dialogs.js:301-372`
- `index.html:1649, 1877, 2485, 2528, 2555`
- `js/docs-generator.js:3032-3100`, `js/financials.js:1378-1388`, `js/app-main.js:589-616, 9702-9728`, `js/bill-auditor.js:1703-1725, 1876-1918`

#### Pasos de Implementación
1. Añadir `raPromptAsync(message, opts)` en `js/a11y-dialogs.js` reutilizando la arquitectura accesible de `raConfirmAsync`, y migrar `proposal-style-studio.js:2921`, `wind-ui.js:787` y `wind-catalog.js:694`.
2. Crear helper global `window.RA.withButtonLoading(btn, loadingText, asyncFn)` que aplique `disabled = true`, `aria-busy = 'true'`, clase `.is-loading` con spinner y restauración garantizada en `finally`.
3. Conectar `withButtonLoading` a `generateDeliveryPack`, `wpDownloadSelectedProposal`, `wpCompararEscenarios`, `wpRunHeatmapAndActivateView` y los tres botones de `bill-auditor.js` (`#btn-parse-pasted-ai`, `#btn-parse-pasted-local`, `#btn-apply-bill-data`).

#### Criterios de Aceptación
- Cero llamadas nativas a `alert()`, `confirm()` o `prompt()` en todo `js/`.
- Doble clic rápido sobre descarga de pack, PDF, comparador, parseo de factura o heatmap produce exactamente 1 ejecución con feedback visual de progreso.

---

### `F5-05` — Desacoplar toggle desktop/móvil de Outliner e implantar escala única de tokens `z-index` (7 niveles)

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Bug UI/UX |
| **Severidad** | P1 (Alto) |
| **Esfuerzo** | M (2–8 horas) |
| **Dependencias** | F5-01 |
| **Origen** | E-07 |
| **Rama sugerida** | `fix/ui-zindex-scale-and-outliner-toggle` |
| **Estado** | `[Hecho]` |

#### Contexto y Problema
`UIOutliner.toggle()` depende de la clase `mobile-active` incluso en escritorio, y coexisten **38** valores arbitrarios de `z-index >= 1000` (7 elementos empatan en `999999`, compitiendo por orden de inserción en el DOM).

#### Evidencia Verificada
- `js/ui-outliner.js:75-111, 577`, `css/styles.css:924, 1753, 2794-2850, 2999`
- `index.html:2613, 2746, 3168, 3645, 3917, 3971, 3979`
- `js/proposal-style-studio.js:1679`, `js/bill-auditor.js:1008`, `js/a11y-dialogs.js:281, 330`, `js/wind/wind-ui.js:248`

#### Pasos de Implementación
1. Definir escala estricta de 8 tokens `z-index` en `:root` (`css/styles.css`): `--z-hud: 100`, `--z-floating: 200`, `--z-popover: 300`, `--z-overlay: 400`, `--z-modal: 500`, `--z-modal-nested: 550`, `--z-confirm: 600`, `--z-toast: 700` y sustituir todos los literales `950..2000000` por el token correspondiente.
2. En `UIOutliner`, gestionar apertura/cierre con estado explícito `isOpen` / `hidden` independiente de `@media (max-width: 768px)` sin usar la clase `.mobile-active` como flag de escritorio.

#### Criterios de Aceptación
- Ningún `z-index` manual supera `700` en CSS, HTML ni templates JS, y ningún modal compite al abrirse sobre otro.
- `UIOutliner.toggle()` alterna limpiamente en escritorio y móvil independientemente del breakpoint.

---

### `F5-06` — Hacer explicables los pasos bloqueados (`aria-disabled`), añadir footer sticky en Paso 1 y limpiar `#tab-btn-*`

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Flujo de Usuario |
| **Severidad** | P1 (Alto) |
| **Esfuerzo** | M (2–8 horas) |
| **Dependencias** | F5-02 |
| **Origen** | E-08 |
| **Rama sugerida** | `fix/stepper-ux-and-footer-nav` |
| **Estado** | `[Hecho]` |

#### Contexto y Problema
1. `.wp-step-btn.disabled` aplica `pointer-events: none !important`, ocultando tooltips explicativos y bloqueando el aviso clicable de `PASO BLOQUEADO`, mientras sigue siendo enfocable con teclado sin `aria-disabled="true"`.
2. El botón `CONTINUAR A CAMPO SOLAR (PASO 2)` vive escondido dentro de un acordeón desplegable del Paso 1 (`#wp-subdock-body-obs`, que inicia oculto y se pliega al abrir `1.1` o `1.2`).
3. Sobreviven referencias legacy a `#tab-btn-*` inexistentes y IDs cruzados (`#p3-stat-*` en Paso 2, `#step3-smart-inverter-recommendations` en Paso 4).

#### Evidencia Verificada
- `css/styles.css:198-203`
- `js/working-plane.js:3996-4006, 4106-4121, 6500-6550, 7575`, `js/workflow-orchestrator.js:332-348`
- `index.html:1108, 1222, 1229-1234, 1259-1271, 2634`

#### Pasos de Implementación
1. Retirar `pointer-events: none !important` de `.wp-step-btn.disabled` y usar `aria-disabled="true"` con estilo atenuado pero clicable/hoverable para mostrar el motivo exacto de bloqueo y botón directo de acción para desbloquearlo.
2. Extraer la navegación de avance (`Paso Anterior / Siguiente Paso`) a un footer fijo común del sidebar fuera de los acordeones de Paso 1–5.
3. Limpiar las actualizaciones muertas de `#tab-btn-*` y normalizar progresivamente los IDs de Paso 2/3/4 junto con sus lectores JS.

#### Criterios de Aceptación
- Pasar o pulsar en un paso bloqueado explica exactamente qué falta (ej. "Dibuja al menos 1 faldón solar").
- El CTA de avance al Paso 2 permanece visible con cualquier acordeón desplegado/plegado en Paso 1.

---

### `F5-07` — Declarar 9 variables CSS faltantes, corregir contrastes AA (`#64748B`, botones, sidebar) y extraer estilos inline

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Inconsistencia Visual / Accesibilidad WCAG |
| **Severidad** | P1 (Alto) |
| **Esfuerzo** | XL (>3 días; dividido en sub-entrega S rápida para tokens/contraste + L/XL para migración de templates) |
| **Dependencias** | Ninguna |
| **Origen** | E-09 + E-13 |
| **Rama sugerida** | `style/design-tokens-contrast-aa` |
| **Estado** | `[Parcial]` |

#### Contexto y Problema
1. **9 variables CSS indefinidas** se referencian **72 veces** (`--emerald-400`, `--sky-400`, `--sky-500`, `--cyan-400`, `--rose-400`, `--text-slate-200`, `--blue-400`, `--sky-300`, `--amber-300`), haciendo que etiquetas como `RENDIMIENTO` o `72 RAYOS` queden transparentes/sin fondo; `--text-slate-400` está duplicada y `index.html:1758` contiene `hover:background:#047857` dentro de `style="..."`.
2. Fallos de contraste WCAG AA: `--text-slate-500` (`#64748B`, 3.07–3.75:1), botones blanco sobre `#10B981`/`#059669` (2.54–3.77:1) y sobre `#0284C7` (4.10:1), además de `#ra-sidebar` aclarándose hasta `rgb(200,200,200)` al final del gradiente.
3. Acumulación de **2.640** `style="..."` inline y **1.747** colores hardcodeados fuera de tokens.

#### Evidencia Verificada
- `css/styles.css:6, 48, 49, 317, 373, 394, 1251-1253, 1371, 2435`
- `index.html:479-488, 1615, 1630, 1758, 2528, 2555, 2625, 2976, 3109, 3130, 3945, 3958, 4099, 4113, 4122, 4141, 4159`
- `js/cost-modal-ui.js:268`, `js/proposal-style-studio.js:1590-2750`, `js/wind/wind-ui.js:542-1279`, `js/bill-auditor.js:1008-1270`

#### Pasos de Implementación
1. *(Sub-entrega rápida prioritaria)*: Declarar las 9 variables CSS en `:root`, eliminar `--text-slate-400` duplicada y el `hover:` inválido de `index.html:1758`, corregir `--text-slate-500` en textos a `#94A3B8` (6.96:1), ajustar fondos de botones primarios (`#047857` con blanco >=5.4:1 o texto oscuro `#042F2E` sobre `#10B981`; `#0369A1` con blanco >=5.9:1) y fijar `#ra-sidebar` en gradiente oscuro uniforme (`#0A1628`–`#0F172A`).
2. *(Refactor gradual)*: Crear `css/tokens.css` + `css/components.css` con clases utilitarias/componentes (`ra-card`, `ra-badge`, `ra-btn-*`, `ra-grid-*`) y migrar por módulo (`index.html` -> `proposal-style-studio.js` -> `wind-ui.js` -> `bill-auditor.js` -> `working-plane.js`) reduciendo `style="..."` inline ≥ 80%.

#### Criterios de Aceptación
- **0** variables CSS indefinidas `var(--*)` en CSS/HTML/JS.
- **100%** de textos <18px y botones cumplen contraste **>= 4.5:1**.
- Reducción de estilos inline `style="..."` >= 80% al cierre de la migración de componentes.

---

### `F5-08` — Erradicar microtipografía `< 11px` (993 ocurrencias) fijando escala legible en paneles y modales

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Inconsistencia Visual / Usabilidad |
| **Severidad** | P1 (Alto) |
| **Esfuerzo** | L (1–3 días) |
| **Dependencias** | F5-07 |
| **Origen** | E-10 |
| **Rama sugerida** | `style/typography-minimum-11px` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
**993 declaraciones** de tamaño de fuente por debajo de `11px` (`8px`–`10.5px`) en datos eléctricos críticos (MPPT, cables, tarifas, tablas de factura y estudio de estilos), pisando los estilos base de `14px` de `styles.css`.

#### Evidencia Verificada
- `index.html` (632), `js/wind/wind-ui.js` (75), `js/proposal-style-studio.js` (62), `js/bill-auditor.js` (62), `js/working-plane.js` (55), `js/mppt-matrix-controller.js` (38, `8px–8.5px`), `js/ui-outliner.js` (27), `css/styles.css` (16), `js/engineering-explainer.js` (14), `js/project-status-hud.js` (12).

#### Pasos de Implementación
1. Definir tokens de escala en `tokens.css`: `--fs-body: 13px`, `--fs-control: 12px`, `--fs-micro: 11px` (estrictamente solo para badges cortos con `letter-spacing` y `font-variant-numeric: tabular-nums`).
2. Elevar progresivamente todas las declaraciones `< 11px` al menos a `11px`/`12px`, ajustando rellenos (`padding`) y convirtiendo tarjetas densas como la matriz MPPT o grillas de factura en layouts más aireados (modales o cajón inferior amplio en vez de comprimir en 350px).

#### Criterios de Aceptación
- Búsqueda `font-size:\s*(10(\.[0-9]+)?|[0-9](\.[0-9]+)?)px` sobre `index.html`, CSS y módulos UI devuelve **0** coincidencias.

---

### `F5-09` — Corregir desbordamientos responsive en móvil (`<=768px`) y portátiles (`1280×720` / `1366×768`)

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Responsive |
| **Severidad** | P1 (Alto) |
| **Esfuerzo** | L (1–3 días) |
| **Dependencias** | F5-05, F5-07 |
| **Origen** | E-11 |
| **Rama sugerida** | `fix/responsive-laptop-and-mobile-huds` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
1. Bajo `<=768px`, `styles.css:3014-3032` compacta a 40px solo 3 botones de `#ra-floating-tools-container` ignorando los 4 agregados después, desbordando horizontalmente fuera de pantalla.
2. En portátiles `1280×720` y `1366×768` no existen media queries de altura (`max-height`), provocando choques entre `#ra-cad-outliner-panel`, toolbar flotante inferior (`7` píldoras anchas), `#ra-solar-time-hud` (`min-width: 540px`) y `#ra-project-status-hud` frente a `#ra-hud-energy`.
3. `.stat-pill-label` a `14px` desborda dentro de `.stat-grid-3` en sidebars estrechos.

#### Evidencia Verificada
- `css/styles.css:393, 1137, 2049-2069, 2736-2781, 3007-3033`
- `index.html:366-421, 1259-1272, 3975-3988, 4168-4202`
- `js/ui-outliner.js:565-568`, `js/project-status-hud.js:163-173`

#### Pasos de Implementación
1. Aplicar clase unificada `.floating-tool-btn` a todos los botones de `#ra-floating-tools-container` para que el breakpoint `<=1024px` / `<=768px` los compacte a icono + tooltip uniforme o barra deslizable sin overflow.
2. Implementar área segura de viewport coordinada por variables CSS (`--sidebar-current-w`: `0px` cuando colapsado, `350px..400px` abierto) para centrar/desplazar `#ra-hud-energy` y `#ra-solar-time-hud` sobre el espacio libre real, evitando solapes con `#ra-project-status-hud`.
3. Añadir `@media (max-height: 780px)` reduciendo márgenes/alturas de Outliner y HUD solar y ajustar `.stat-pill-label` a `12px` con `text-overflow` seguro en `.stat-grid-3`.

#### Criterios de Aceptación
- Test visual/Playwright en viewports `375×812`, `768×1024`, `1280×720` y `1366×768` verifica `document.documentElement.scrollWidth <= window.innerWidth` y cero superposición geométrica entre paneles/HUDs visibles.

---

### `F5-10` — Hacer operable `#ra-hud-energy` y tooltips por teclado, eliminar controles anidados, añadir landmarks y arreglar tablas/iconos

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Accesibilidad WCAG |
| **Severidad** | P1–P2 |
| **Esfuerzo** | L (1–3 días) |
| **Dependencias** | F5-02, F5-07 |
| **Origen** | E-12 + E-14 + E-15 + E-16 |
| **Rama sugerida** | `fix/wcag-landmarks-tables-controls` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
1. **Hover-only**: `#ra-hud-energy` y `.tooltip-container` solo muestran info por `:hover`, inaccesibles por teclado y touch (`E-12`).
2. **Controles anidados e insemánticos**: `ui-outliner.js` y `wind-ui.js` envuelven `<button>` dentro de `<div onclick>`, creando botones anidados ilegales tras la mutación de `a11y-dialogs.js:147`; `ui-viewport-controls.js:239` usa `<span onclick>` y `bill-auditor.js:1023` `<div onclick>`.
3. **Landmarks/Headings**: `0` `skip-link`, `0` `<main>`, `0` `<h1>`/`<h2>` antes de `<h3>` en `index.html`, y los 5 modales del HTML + 3 modales JS carecen de `aria-labelledby` (algunos sin `<h*>`) (`E-14`).
4. **Tablas**: `26/26` `<th>` carecen de `scope="col"` y las `19` columnas ordenables usan `onclick` en `<th>` sin `<button>` ni `aria-sort` (`E-15`).
5. **Iconos sin label**: botones `"✕"`, `"▼"`, emojis `⚡/🔍/🗑` y `#pss-btn-close` anuncian símbolos crudos o `"btn close"` (`E-16`).

#### Evidencia Verificada
- `index.html:120-124, 184-239, 2746-2854, 3168-3181, 3645-3658, 3823-3930`
- `js/ui-outliner.js:36, 43-44, 180, 193, 218, 245, 256`
- `js/wind/wind-ui.js:779-789, 948`, `js/ui-viewport-controls.js:239`, `js/bill-auditor.js:1008-1027, 1237-1270`
- `js/proposal-style-studio.js:1678-1710`, `js/financials.js:1402-1408`, `js/a11y-dialogs.js:44-93, 137-163`

#### Pasos de Implementación
1. Convertir `#ra-hud-energy` en botón toggle (`aria-expanded`, `aria-controls`, apertura por clic/Enter y cierre con `Escape`/outside click) y soportar `:focus-within` + `Escape` en tooltips.
2. Desanidar controles en `ui-outliner.js` y `wind-ui.js`: la tarjeta padre pasa a `<div>`/`<li>` neutro, el nombre de fila es un `<button>` hermano de los botones de acción; cambiar `span[onclick]`/`div[onclick]` restantes por `<button type="button">` y retirar la heurística que añade `role="button"` a padres que ya contienen botones en `a11y-dialogs.js:147`.
3. Añadir `skip-link` al inicio del `<body>`, `<main>` para el visor 3D, `<h1 class="sr-only">` / `<h2 class="sr-only">` estructurales y convertir todos los títulos de modales a `<h2 id="...-title">` enlazados con `aria-labelledby`.
4. Añadir `scope="col"` a los 26 `<th>`, insertar `<button type="button">` dentro de las 19 cabeceras ordenables y gestionar `aria-sort="ascending|descending|none"`.
5. Añadir `aria-label` claros en español a `#btn-close-bill-modal`, `#pss-btn-close`, `#outliner-collapse-btn` (con `aria-expanded`) y botones de turbinas (con `aria-pressed`), reforzando `_deriveButtonLabel` en `a11y-dialogs.js`.

#### Criterios de Aceptación
- Auditoría automatizada (axe-core / Lighthouse Accessibility) supera **90/100** con **0 errores** de controles anidados, tablas, labels, nombres de botón ni saltos de headings.
