# 🛡️ AUDITORÍA DE CALIDAD DE CÓDIGO (AAA) Y ARQUITECTURA: "RA"
**Fecha:** 10 de Octubre de 2026
**Auditor:** Ingeniero Fotovoltaico & Software Architect
**Alcance:** Revisión profunda de código fuente, interferencia de funciones, memory leaks, antipatrones y calidad estructural (Clean Code & AAA).

---

## 1. 🚨 BUGS CRÍTICOS E INTERFERENCIAS DE FUNCIONES (Namespace Collisions)

He rastreado el árbol de llamadas y las inyecciones globales del código. He detectado un bug grave de diseño estructural que puede hacer colapsar la simulación:

*   **Colisión de `computeAnnualSolarHeatmap`:** 
    *   En `js/solar-heatmap.js` (Línea 370) existe `async function computeAnnualSolarHeatmap(onProgressCallback)`. Además, se expone al objeto global (`window.computeAnnualSolarHeatmap = ...`).
    *   En `index.html` (Línea 14436) se vuelve a declarar `async function computeAnnualSolarHeatmap(onProgressCallback)`. 
    *   **Efecto:** Como el código en `<script>` anidado se evalúa de forma procedural, ambas funciones compiten por el mismo nombre en el scope global de `window`. Esto genera una interferencia directa donde la versión de `index.html` funciona como *wrapper*, pero el *hoisting* de JavaScript puede provocar que se machaquen entre sí dependiendo del orden de carga de la red, derivando en un bucle infinito en `index.html:14448`.

## 2. 🕳️ ANTIPATRONES DE ERROR (El "Catch Silenciado")

*   **El Síndrome del `[catch silenciado]`:** 
    A lo largo de las ~17.000 líneas de `index.html`, existen decenas de bloques como este:
    ```javascript
    try { viewer.entities.remove(ent); } catch(err) { window.RA.log.warn('[catch silenciado]', err); }
    ```
    *   **Diagnóstico:** Tragar errores (*swallowing errors*) silenciosamente al destruir primitivas de CesiumJS (Z-Buffer, entidades, polilíneas) es un antipatrón masivo. Si una entidad no se puede eliminar porque ya fue destruida o su referencia es nula, significa que hay un fallo de diseño en la máquina de estados. Estos fallos se acumulan generando "Entidades Zombi" que devoran la RAM del cliente y hunden los FPS tras 15 minutos de uso de la herramienta.

## 3. 📉 RENDIMIENTO WEBGL Y MEMORY LEAKS

*   **Event Listeners Globales Sin Saneamiento:** 
    Existen múltiples `window.addEventListener('keydown')`, `mousemove` y `drop` registrados globalmente (ej. L: 4342, 16720 de `index.html`). 
*   **Debouncing en el Gizmo:** Durante la edición de un faldón o al arrastrar (`drag`) un grupo de 50 paneles, los eventos de ratón se disparan a la tasa de refresco del ratón (hasta 1000 Hz). Si el repintado de la simetría o cables no está envuelto estrictamente en un `requestAnimationFrame` o no tiene *debouncing*, el motor WebGL se ahoga.

## 4. 🔗 ROBUSTEZ Y CALIDAD AAA (Gestión de Promesas)

*   **Llamadas Async sin Red de Seguridad:** 
    Funciones de alto peso como `runPVGISCalc`, `loadCesium3D`, y `enrichSummaryWithGemini` (en `financials.js`) se asumen felices (Happy Path). Si la API de PVGIS se cae por Timeout, o Gemini devuelve un 503, no hay bloques `try...catch` robustos en la capa del servicio que propaguen un error elegante a la UI. El frontend simplemente "se cuelga" dejando al usuario en un estado de espera infinito (Spinners congelados).

*   **Acoplamiento Extremo (Monolito):**
    A pesar del buen trabajo migrando componentes a la carpeta `/js` (`workflow-orchestrator.js`, `cable-engine.js`), `index.html` sigue siendo un mega-fichero (*God Object*) con más de 17.000 líneas. El estado de la aplicación (`solarSimState`, `cat`, config) flota libremente en el objeto `window`, haciéndolo inestable para pruebas unitarias (TDD/Jest).

---

## 5. 🛠️ PLAN DE ACCIÓN DE REFACTORIZACIÓN TÉCNICA (CLEAN CODE)

**Fase 1: Erradicar Interferencias de Namespace**
- Aislar todas las funciones de `index.html` dentro de un Módulo/Namespace estricto (ej. `window.RA_App`).
- Renombrar o eliminar el *wrapper* de `computeAnnualSolarHeatmap` en `index.html` para no hacer *shadowing* sobre el motor puro de `solar-heatmap.js`.

**Fase 2: Arquitectura de Control de Errores (Error Boundary)**
- Prohibir los `catch(e) { /* silenciado */ }`. Reemplazarlos por una rutina centralizada `RA_ErrorHandler.handle(e, context)` que intente recuperar el estado del renderizador de Cesium y avise al usuario si es necesario recargar.
- Envolver todas las funciones `async` que llamen a APIs externas (PVGIS, Gemini) en bloques `try...catch` que restauren la UI a un estado interactivo si la red falla.

**Fase 3: Rendimiento de Renderizado (60 FPS Lock)**
- Implementar un patrón de `DirtyFlag` + `requestAnimationFrame` para el Gizmo y los planos de trabajo. Nunca actualizar las polilíneas GPU en un `mousemove` directo.
- Desacoplar la lógica de *snapping* matemático del bucle de pintado.

**Fase 4: Despiece del Monolito (index.html)**
- Migrar toda la lógica del "Gizmo 2D/3D" a un archivo independiente (`gizmo-engine.js`).
- Migrar toda la lógica de dibujo (P1/P2/P3 y faldones) a `working-plane.js` (extrayendo las 3.000 líneas restantes que siguen en el HTML).
