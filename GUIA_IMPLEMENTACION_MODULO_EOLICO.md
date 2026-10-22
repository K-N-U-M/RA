# GUÍA MAESTRA DE IMPLEMENTACIÓN QUIRÚRGICA: MÓDULO EÓLICO (RA-WIND)
**Documento Canónico de Especificación Técnica, Arquitectura y Pasos de Ejecución para IA de Programación**  
*Versión: 2.0-AAA Impermeable (Post-Rollback y Lecciones Aprendidas)*  
*Entorno de Ejecución: Vanilla JS (IIFE/UMD), CesiumJS 3D, HTML5, CSS3, Node.js Test Suite (`node -c`)*  
*Garantía Absoluta: CERO regresión en proyectos solares existentes. Sin creación de tests sintéticos.*

---

## 1. REGLAS GLOBALES NO NEGOCIABLES (LEER ANTES DE TOCAR NADA)

1. **PROHIBIDO CREAR TESTS SINTÉTICOS PROPIOS:**
   * La IA ejecutora **NO debe crear** archivos de pruebas propios en `tests/` (`test-*.js`).
   * La validación automatizada se limitará **exclusivamente** a la suite existente oficial ejecutada mediante `npm test` en `C:/TRABAJOS/RA/RA`.
   * Toda comprobación de funcionalidad de interfaz o 3D se valida mediante el **Protocolo de Pruebas Manuales en Navegador** detallado en este documento.

2. **PATRÓN DE EMPAQUETADO ESTRICTO (UMD / IIFE):**
   * **PROHIBIDO usar `export` o `import` de ES6**. El proyecto no usa bundlers (Webpack/Vite/Rollup) y el linter `tests/test-js-syntax.js` ejecuta `node -c` en crudo sobre los ficheros.
   * Todos los ficheros `.js` deben envolverse en:
     ```javascript
     (function (global) {
       'use strict';
       var RAWind = global.RAWind || (global.RAWind = {});
       // Lógica del módulo...
       if (typeof module !== 'undefined' && module.exports) {
         module.exports = ...;
       }
     })(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : global));
     ```

3. **INTEGRIDAD ESTRUCTURAL DEL DOM (LECCIÓN APRENDIDA CRÍTICA):**
   * **Causa de la rotura anterior:** Al modificar `index.html`, se insertó una etiqueta de cierre `</div><!-- /wp-step2-solar-panel -->` huérfana dentro del Paso 1 (zona de obstáculos), rompiendo el cierre del contenedor principal del Paso 1 y desplazando toda la jerarquía de los pasos 2, 3, 4 y 5.
   * **Regla de oro de inyección en `index.html`:** Todo contenedor inyectado debe abrirse y cerrarse con balance exacto de etiquetas `<div>...</div>` sin desbalancear los bloques adyacentes de `wp-p1-*` o `wp-step-*`.

4. **DESACOPLAMIENTO Y RESILIENCIA (DEFENSIVE PROGRAMMING):**
   * Todo acceso a Cesium, ventanas modales o motores fotovoltaicos debe llevar comprobación de tipo:
     `if (typeof window !== 'undefined' && window.Cesium) { ... }`
   * Si Cesium no está listo o la escena no está creada, los métodos deben retornar `null` o salir pacíficamente sin lanzar excepciones que congelen el hilo principal.

---

## 2. ARQUITECTURA DEL MÓDULO EÓLICO Y FICHEROS

Todos los ficheros nuevos del subsistema eólico residen en: `C:/TRABAJOS/RA/RA/js/wind/`

```
C:/TRABAJOS/RA/RA/
├── js/
│   ├── wind/
│   │   ├── wind-constants.js          # Constantes físicas, normativas españolas y coeficientes
│   │   ├── wind-catalog.js            # Catálogo: 6 modelos españoles por defecto, persistencia localStorage, IA
│   │   ├── wind-entity.js             # Objeto de dominio WindTurbineInstance, colección window.windTurbines[]
│   │   ├── wind-visualizer.js         # Primitivas 3D CesiumJS consolidadas (HAWT y VAWT)
│   │   └── wind-ui.js                 # Controlador UI: subpestaña 💨 del Paso 2 y colocación 3D en escena
│   ├── equipment-ai-importer.js       # Integración aditiva de categoría 'wind_turbines' para datasheets PDF
│   ├── equipment-web-search.js        # Integración aditiva de categoría 'wind_turbines' para búsqueda web IA
│   ├── project-storage.js             # Serialización y deserialización de windTurbines[] en .raproject
│   ├── workflow-orchestrator.js       # Actualización de guards para permitir proyectos eólicos o híbridos
│   ├── working-plane.js               # Switcher de pestañas del modal de catálogo
│   └── index.html                     # Inyección limpia de subdock en Paso 2 y scripts en el head
```

---

## 3. PASOS DE IMPLEMENTACIÓN QUIRÚRGICA (FASE 1)

### PASO 1: Creación de Módulos Puros en `js/wind/`

#### 1.1. `C:/TRABAJOS/RA/RA/js/wind/wind-constants.js`
* **Propósito:** Constantes de densidad del aire ($1.225\,\text{kg/m}^3$), límites normativos (caída de tensión $\le 1.5\%$, acústica diurna $45\,\text{dBA}$, nocturna $35\,\text{dBA}$ según RD 1367/2007, distancia mínima entre rotores $3.0 \times D$, radio de seguridad $1.1 \times H_{\text{punta}}$).
* **Patrón:** IIFE con exportación a `RAWind.CONSTANTS` y `module.exports`.

#### 1.2. `C:/TRABAJOS/RA/RA/js/wind/wind-catalog.js`
* **Propósito:** Gestión integral del catálogo de aerogeneradores.
* **Modelos comerciales españoles precargados (SSOT):**
  1. *Bornay Wind 25.3* (25 kW HAWT, 6.4m rotor, mástiles 12-30m, PMSG 400V).
  2. *Bornay Wind 6* (6 kW HAWT, 3.2m rotor, mástiles 6-18m, PMSG 48V).
  3. *Enair 30L* (30 kW HAWT, 8.0m rotor, mástiles 18-36m, PMSG 400V).
  4. *Enair 10L* (10 kW HAWT, 5.0m rotor, mástiles 12-24m, PMSG 400V).
  5. *Kliux Gecko* (2.5 kW VAWT eje vertical, 2.0m rotor, silencioso 88 dBA).
  6. *Kliux Winds 100* (100 kW HAWT, 19.0m rotor, mástiles 30-50m).
* **Persistencia:** `localStorage` bajo clave `'ra_wind_catalog_v1'`. Si no existe o se limpia, recarga los 6 por defecto.
* **Integración IA:**
  * Método `getAIExtractionPrompt()` para análisis de PDFs de turbinas.
  * Método `getAISearchPrompt(query)` para búsqueda web IA de modelos eólicos.
  * Método `sanitizeFromAI(raw)` para normalizar respuestas JSON al formato canónico `WindTurbineCatalogItem`.
  * Método `renderTable()` para la visualización dentro del modal de catálogo.
  * Inyección en el modal: pestaña `cat-tab-btn-wind_turbines` y contenedor `cat-pane-wind_turbines`.

#### 1.3. `C:/TRABAJOS/RA/RA/js/wind/wind-entity.js`
* **Propósito:** Objeto de dominio y gestión de la colección reactiva `window.windTurbines[]`.
* **Capacidades:**
  * `createInstance(catalogItem, options)`: genera instancia con UUID, posición cartográfica, tipo de soporte y curva de potencia.
  * `addToScene(instance)`: añade a `window.windTurbines` y emite evento `'wind_turbine_added'`.
  * `updatePosition(id, lonRad, latRad, altM)`: actualiza posición durante arrastre sin disparar eventos pesados por cada frame.
  * `updateProp(id, key, value)`: actualiza altura de buje, orientación o estado activo, invalidando caché (`isDirty = true`).
  * `checkRotorClearance(instance)`: detecta si la distancia a otro aerogenerador es menor a $3 \times D$ (alerta preventiva de turbulencias).
  * `serializeAll()` / `deserializeAll(dataArray)`: persistencia limpia para `.raproject`.
  * `migrateLegacyObstacles()`: migra de forma transparente obstáculos antiguos de tipo `wind_turbine` a objetos de dominio de primera clase.

#### 1.4. `C:/TRABAJOS/RA/RA/js/wind/wind-visualizer.js`
* **Propósito:** Renderizado 3D de aerogeneradores con CesiumJS.
* **Principios de Rendimiento AAA:**
  * **Batching WebGL:** Cada aerogenerador se renderiza como una única `Cesium.Primitive` que agrupa el mástil cilíndrico, la góndola rectangular y las aspas orientadas.
  * **Zero-Recreation:** Durante el movimiento con Gizmo, solo se muta `rootModelMatrix` en la GPU.
  * Soporte nativo de modelos de eje horizontal (HAWT) y vertical (VAWT).
  * Soporte de selección visual (color de resalte en `#F59E0B`).

#### 1.5. `C:/TRABAJOS/RA/RA/js/wind/wind-ui.js`
* **Propósito:** Controlador de la experiencia de usuario eólico.
* **Flujos:**
  * `startTurbinePlacement(catalogItem)`: activa el modo de colocación, muestra un banner flotante superior con el modelo seleccionado y tecla ESC para cancelar.
  * `placeAtCartesian(cartesian)`: convierte clic en el visor Cesium a coordenadas cartográficas, instancia la turbina, comprueba distancias normativas y conmuta a la subpestaña eólica.
  * `renderStep2Panel()`: dibuja en el subpanel eólico del Paso 2 la lista de aerogeneradores activos, potencia total instalada en kWp, interruptor individual de habilitar/deshabilitar, botón de enfoque de cámara 3D (flyTo) y borrado.

---

### PASO 2: Integración Aditiva en Módulos Existentes

#### 2.1. `C:/TRABAJOS/RA/RA/js/equipment-ai-importer.js`
* Añadir `'wind_turbines'` a la lista de categorías soportadas en el prompt del sistema y en la validación:
  `if (!['modules', 'inverters', 'batteries', 'microinverters', 'wind_turbines'].includes(category)) ...`
* En `commitToCatalog(item)`: Si la categoría es `'wind_turbines'`, delegar en `RAWindCatalog.upsert(item)`.
* En la previsualización del importador, formatear los datos clave de turbinas (potencia kW, diámetro de rotor, mástil, dBA).

#### 2.2. `C:/TRABAJOS/RA/RA/js/equipment-web-search.js`
* Añadir `'wind_turbines'` al desplegable de categorías de búsqueda IA.
* En `buildSearchPrompt`: incluir el esquema JSON de aerogeneradores y ejemplos de marcas comerciales (Bornay, Enair, Kliux, Vestas, Enercon).
* En `saveToCatalog(item)`: Si es `'wind_turbines'`, insertar en `RAWindCatalog` y abrir la pestaña de aerogeneradores.
* Añadir tags rápidos de búsqueda: `"Bornay Wind 25.3"`, `"Enair 30L"`.

#### 2.3. `C:/TRABAJOS/RA/RA/js/project-storage.js`
* **En `raExportProjectData()` (Guardado):**
  Añadir el campo `windTurbines`:
  ```javascript
  windTurbines: (typeof window !== 'undefined' && window.RAWind && window.RAWind.Entity)
    ? window.RAWind.Entity.serializeAll()
    : (Array.isArray(window.windTurbines) ? window.windTurbines.map(...) : [])
  ```
* **En `raImportProjectData()` (Carga):**
  Tras restaurar faldones y obstáculos:
  ```javascript
  if (typeof window !== 'undefined' && window.RAWind && window.RAWind.Entity) {
    if (Array.isArray(projectData.windTurbines)) {
      window.RAWind.Entity.deserializeAll(projectData.windTurbines);
    }
    try { window.RAWind.Entity.migrateLegacyObstacles(); } catch(eMig) {}
    if (window.RAWindVisualizer && typeof window.RAWindVisualizer.renderAll === 'function') {
      try { window.RAWindVisualizer.renderAll(); } catch(eWv) {}
    }
    if (window.RAWindUI && typeof window.RAWindUI.renderStep2Panel === 'function') {
      try { window.RAWindUI.renderStep2Panel(); } catch(eWu) {}
    }
  }
  ```

#### 2.4. `C:/TRABAJOS/RA/RA/js/workflow-orchestrator.js`
* Añadir método `hasActiveGenerationSource()` a la clase `WorkflowOrchestrator`:
  ```javascript
  hasActiveGenerationSource() {
    const hasPanels = this.hasGeneratedPanels();
    const hasWind = Array.isArray(global.windTurbines) && global.windTurbines.some(t => t && t.operationalState && t.operationalState.enabled !== false);
    return hasPanels || hasWind;
  }
  ```
* En `canEnterStep(step)`:
  * Pasos 3 y 4: Exigir `hasActiveGenerationSource()` en lugar de únicamente `hasGeneratedPanels()`.
  * Paso 5: Permitir el paso si hay aerogeneradores activos, incluso en instalaciones puramente eólicas sin inversor solar fotovoltaico centralizado.

#### 2.5. `C:/TRABAJOS/RA/RA/js/working-plane.js`
* En `switchCatalogTab(tabName)`:
  * Incluir `'wind_turbines'` en la lista de pestañas evaluadas:
    `['modules', 'inverters', 'batteries', 'microinverters', 'wind_turbines', 'structures', 'installation_costs', 'add_new', 'edit', 'ai_import', 'ai_search']`
  * Si `tabName === 'wind_turbines'`, invocar `RAWindCatalog.refreshPanel()`.

---

### PASO 3: Modificación Quirúrgica de `index.html`

Para no provocar jamás desbalanceos en el DOM:

1. **Carga de Scripts en el `<head>`:**
   Justo después de `<script src="js/wind-turbine.js?v=20261011a"></script>`:
   ```html
   <script src="js/wind/wind-constants.js?v=20261022a"></script>
   <script src="js/wind/wind-catalog.js?v=20261022a"></script>
   <script src="js/wind/wind-entity.js?v=20261022a"></script>
   <script src="js/wind/wind-visualizer.js?v=20261022a"></script>
   <script src="js/wind/wind-ui.js?v=20261022a"></script>
   <script>
     document.addEventListener("DOMContentLoaded", function() {
       if (window.RAWindCatalog && typeof window.RAWindCatalog.injectCatalogTab === "function") {
         window.RAWindCatalog.injectCatalogTab();
       }
       if (window.RAWindUI && typeof window.RAWindUI.init === "function") {
         window.RAWindUI.init();
       }
     });
   </script>
   ```

2. **Acceso Rápido desde Paso 1 (Obstáculos):**
   Localizar el botón con id `obs-btn-wind-turbine` y actualizar su `onclick`:
   ```html
   <button class="doc-mini-btn" id="obs-btn-wind-turbine" onclick="if(typeof openEquipmentCatalogModal==='function'){openEquipmentCatalogModal('wind_turbines');}else{startObstaclePlacement('wind_turbine');}" style="text-align:center;">
     <span class="doc-icon"><i data-lucide="wind" class="icon-sm"></i></span><span>+ EÓLICA</span><span class="doc-sub">Aerogenerador</span>
   </button>
   ```

3. **Subpestañas Dentro de `#wp-step-2-content` (Paso 2):**
   *Localizar la apertura de:*
   `<div id="wp-step-2-content" style="display:none;flex-direction:column;gap:8px;">`
   
   *Envolver el contenido existente de forma balanceada:*
   ```html
   <div id="wp-step-2-content" style="display:none;flex-direction:column;gap:8px;">
     <!-- Subtabs Paso 2: Solar FV vs Eólica -->
     <div id="wp-step2-gen-tabs" style="display:flex;gap:4px;margin-bottom:4px;background:rgba(0,0,0,0.25);padding:4px;border-radius:6px;border:1px solid var(--border-subtle);">
       <button type="button" class="sb-tab-btn active" id="step2-tab-solar" onclick="wpSwitchGenTab('solar')" style="flex:1;padding:6px 8px;font-size:10.5px;border-radius:5px;display:flex;align-items:center;justify-content:center;gap:6px;"><i data-lucide="sun" class="icon-sm"></i> ☀️ SOLAR (FV)</button>
       <button type="button" class="sb-tab-btn" id="step2-tab-wind" onclick="wpSwitchGenTab('wind')" style="flex:1;padding:6px 8px;font-size:10.5px;border-radius:5px;display:flex;align-items:center;justify-content:center;gap:6px;color:#38BDF8;"><i data-lucide="wind" class="icon-sm"></i> 💨 EÓLICA</button>
     </div>
     
     <!-- Panel Eólico (Paso 2) -->
     <div id="wp-step2-wind-panel" style="display:none;"></div>
     
     <!-- Panel Solar (Paso 2) que envuelve todo lo preexistente -->
     <div id="wp-step2-solar-panel" style="display:flex;flex-direction:column;gap:8px;">
       <!-- ... AQUÍ RESIDE INTACTO EL CONTENIDO PREEXISTENTE DEL PASO 2 SOLAR ... -->
     </div><!-- /wp-step2-solar-panel -->
   </div><!-- /wp-step-2-content -->
   ```

4. **Botón y Panel en `ra-equipment-catalog-modal`:**
   En la cabecera de pestañas del modal de catálogo, añadir el botón:
   ```html
   <button class="sb-tab-btn" id="cat-tab-btn-wind_turbines" onclick="switchCatalogTab('wind_turbines')" style="padding:6px 12px;font-size:10.5px;border-radius:6px;color:#38BDF8;border:1px solid rgba(56,189,248,0.5);background:rgba(56,189,248,0.08);"><i data-lucide="wind" class="icon-sm"></i> 💨 AEROGENERADORES</button>
   ```
   En el cuerpo de paneles del modal, añadir:
   ```html
   <div id="cat-pane-wind_turbines" style="display:none;"></div>
   ```

5. **Función Auxiliar `wpSwitchGenTab` en `index.html`:**
   ```javascript
   function wpSwitchGenTab(tab) {
     var solPanel = document.getElementById("wp-step2-solar-panel");
     var wndPanel = document.getElementById("wp-step2-wind-panel");
     var solBtn = document.getElementById("step2-tab-solar");
     var wndBtn = document.getElementById("step2-tab-wind");
     if (solPanel) solPanel.style.display = (tab === "solar") ? "flex" : "none";
     if (wndPanel) wndPanel.style.display = (tab === "wind") ? "block" : "none";
     if (solBtn) solBtn.classList.toggle("active", tab === "solar");
     if (wndBtn) wndBtn.classList.toggle("active", tab === "wind");
     if (tab === "wind" && window.RAWindUI && typeof window.RAWindUI.renderStep2Panel === "function") {
       window.RAWindUI.renderStep2Panel();
     }
   }
   window.wpSwitchGenTab = wpSwitchGenTab;
   ```

6. **Intercepción de Clic de Colocación en `index.html`:**
   En el gestor de eventos de clic en el visor Cesium, antes de colocar obstáculos genéricos:
   ```javascript
   if (window.RAWindUI && typeof window.RAWindUI.isPlacementActive === 'function' && window.RAWindUI.isPlacementActive()) {
     const pos3D = (typeof get3DPosition === 'function') ? get3DPosition(click.position) : null;
     if (pos3D && window.RAWindUI.placeAtCartesian(pos3D)) {
       return;
     }
   }
   ```
   Y en el listener de la tecla `Escape`:
   ```javascript
   if (window.RAWindUI && typeof window.RAWindUI.isPlacementActive === 'function' && window.RAWindUI.isPlacementActive()) {
     window.RAWindUI.cancelPlacement();
     return;
   }
   ```

---

## 4. PROTOCOLO DE VALIDACIÓN MANUAL PASO A PASO (SIN TESTS SINTÉTICOS)

Una vez completada la codificación, la IA debe validar que `npm test` preexistente se mantiene al 100% (cero errores sintácticos en los 42 módulos oficiales) y presentar al usuario la siguiente guía de verificación manual interactiva:

| Prueba | Acción en el Navegador (`http://localhost:8080/`) | Resultado Esperado |
| :--- | :--- | :--- |
| **Prueba 1: Carga y Consola Limpia** | Abrir la app con DevTools abiertas (F12). Recargar con Ctrl+F5. | La consola debe estar limpia de errores críticos. `window.RAWind` y `window.RAWindCatalog` deben estar definidos. |
| **Prueba 2: Catálogo Eólico** | Hacer clic en el botón superior de Catálogo de Equipos. | Debe aparecer la pestaña **💨 AEROGENERADORES** con estilo cian. Al pulsarla, se muestra la tabla con Bornay, Enair y Kliux. |
| **Prueba 3: Búsqueda Web IA Eólica** | En el catálogo, ir a **Búsqueda Web IA**, elegir categoría "Aerogeneradores" o pulsar el tag "Bornay Wind 25.3". | El sistema busca el equipo, muestra la tarjeta técnica y permite incorporarlo al catálogo eólico. |
| **Prueba 4: Importación PDF IA** | En el catálogo, ir a **Importador PDF**, cargar un datasheet eólico. | La IA extrae los parámetros (potencia nominal, diámetro de rotor, tipo HAWT/VAWT) y permite guardarlo. |
| **Prueba 5: Colocación 3D** | En el catálogo eólico, pulsar **USAR** en Bornay Wind 25.3. El modal se cierra y sale el banner flotante superior de colocación. Hacer clic en el terreno o cubierta. | Aparece el aerogenerador 3D (mástil, góndola y aspas) a la altura correcta. Se muestra un toast verde de confirmación. |
| **Prueba 6: Subpestaña Paso 2** | Abrir el panel izquierdo, ir al Paso 2 ("2 CAMPO"). Pulsar en **💨 EÓLICA**. | Se despliega la lista con la turbina colocada, potencia en kWp, botones de centrar cámara (🔍) y toggle de habilitado. |
| **Prueba 7: Persistencia (.raproject)** | Guardar el proyecto desde la barra superior (`proyecto.raproject`). Limpiar la escena y recargar el archivo guardado. | La turbina eólica se restaura exactamente en su posición y altura original junto a cualquier panel solar previo. |
| **Prueba 8: Regresión Cero Solar** | En un proyecto nuevo, crear plano de trabajo (Paso 1), trazar faldón, generar paneles fotovoltaicos y pasar al Paso 3, 4 y 5. | Todos los cálculos fotovoltaicos, generación de strings, selección de inversor y unifilares operan de forma 100% idéntica a la versión original. |

---
*Este documento constituye la especificación canónica y autosuficiente para la Fase 1. No requiere inventar dependencias ni modificar módulos no autorizados.*
