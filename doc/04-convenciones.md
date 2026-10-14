# 04. Convenciones y Reglas para Agentes de IA

> **VERSIÓN CANÓNICA v3.0** — El flujo de trabajo es de **5 pasos**. Ver `AGENTS.md`.

Este documento define las **reglas obligatorias** de desarrollo para cualquier agente (IA) que modifique este repositorio. El objetivo: código limpio, modular, escalable, auditable y **sin código muerto**.

## 1. Reglas de oro

1. **Código muerto prohibido.** Toda función, variable o rama que no se use se elimina o se justifica con un comentario `@TODO`/`@deprecated`. No dejar código comentado "por si acaso".
2. **Sin explicaciones superfluas en el código.** La lógica se autodocumenta con nombres expresivos y comentarios *estructurales* (qué hace el bloque), nunca con comentarios que repitan el código.
3. **Comentarios en español** (idioma del proyecto). Identificadores y nombres de función pueden ser en español o inglés pero deben ser consistentes dentro del archivo.
4. **No inventar APIs.** Antes de usar una función auxiliar verificar que existe y está expuesta en `window`; nunca asumir librerías que no estén referenciadas.
5. **Preservar hooks globales.** Las funciones invocadas desde `onclick`/`onchange` o desde otros módulos deben permanecer accesibles en `window`.

## 2. Manejo de archivos

| Regla | Detalle |
| :--- | :--- |
| **CRLF en `index.html`** | Usa saltos de línea Windows `\r\n`. **NUNCA** reemplazos multilínea ingenuos con solo `\n`; usa regex `\r?\n` o scripts Node con buffers/UTF-8. |
| **`js/*.js`** | Mantener el estilo existente (puntos y coma, comillas, 2 espacios). |
| **`tests/`** | Scripts de verificación reutilizables; no forman parte del runtime. |

## 3. Estructura y modularidad

1. **Un archivo = un dominio.** No mezclar dominios (ej. no meter lógica de edificios en `obstacles.js`).
2. **Módulos nuevos** deben:
   - Cargarse en `index.html` como `<script>` clásico antes del inline principal.
   - Exponer lo necesario en `window`.
   - No generar estado compartido inesperado fuera de sus objetos.
3. **Mantenimiento de overlays 2D:** si se dibuja en `canvas#ra-triad-overlay`, respetar el orden de `renderTriad2D()` (ver `doc/03-arquitectura.md §6`). Colocar bloques frágiles en `try/catch` local para no romper el gizmo universal.

## 4. Manipulación 3D y eventos

1. Usar `new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)` para eventos del visor (o `scene.canvas` si `scene` es `viewer.scene`). **Nunca referenciar `scene` o `camera` directamente desde módulos JS externos a `index.html`; obtenerlos siempre vía `viewer.scene` y `viewer.camera`.**
2. Cualquier arrastre de manipulador **bloquea la cámara** (desactiva `enableRotate/Translate/Tilt/Look/Zoom`) durante el arrastre y la restaura en `LEFT_UP`.
3. El throttling de `pick` GPU se respeta: no eliminar el guardado de `_lastPickTime`/`_PICK_THROTTLE_MS`.
4. Al añadir un manipulador/gizmo que deba renderizarse con objeto seleccionado, verificar que se redibuja también cuando `triadState.active === false` (añadir la llamada al `postRender` o al `cursorGizmoClear/Hide`).

## 5. Verificación (sin tests automáticos)

El usuario comprueba manualmente. Aun así:

1. **Validación de sintaxis** de `js/*.js` y de cada `<script>` de `index.html`:
   ```bash
   node --check "js/working-plane.js"
   node "tests/test-js-syntax.js"
   ```
2. **Suite de verificación** (si se toca cálculo eléctrico, sombras, catálogo o cableado):
   ```bash
   node "tests/test-ra-full-workflow.js"
   node "tests/test-equipment-ai-importer.js"
   ```
3. **No ejecutar pruebas del usuario.** Las pruebas manuales las realiza el usuario con su navegador.

## 6. Normativa a respetar en cálculos

| Normativa | Ámbito |
| :--- | :--- |
| CTE DB-SE-AE | Sobrecarga estructural estimada (kg/m²). |
| REBT ITC-BT-40 | Caída de tensión ≤1.5 %; secciones comerciales normalizadas. |
| IEC 62548 / CTE | Strings MPPT en frío (−10 °C): `V_oc,cold ≤ V_max,dc`. |
| IEC 62548 | Arranque MPPT en caliente (+65 °C): `V_mp,hot ≥ V_mppt,min`. |
| UNE-EN 62305 | Enrutado en serpiente anti-bucle inductivo. |

## 7. Umbrales de calidad (definition of done)

- [ ] Sintaxis validada (`node --check` + `tests/test-js-syntax.js`) sin errores.
- [ ] Sin código muerto añadido al diff.
- [ ] Nombres y comentarios consistentes con el dominio.
- [ ] Si se tocó manipulación 3D: gizmo redibujado en `postRender` (aunque el cursor no esté sobre Cesium).
- [ ] Si se tocó un dominio con verificador: suite `tests/test-ra-full-workflow.js` en 100 % PASS.