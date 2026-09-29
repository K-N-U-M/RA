# 📐 PLAN MAESTRO RA — Implementación del Flujo de 5 Pasos

> **VERSIÓN CANÓNICA v3.0**  
> Este documento reemplaza cualquier plan anterior (flujos de 6 o 7 pasos).  
> Derivado del flujo real de trabajo de un instalador fotovoltaico profesional.

---

## 1. El Flujo Real (Por Qué 5 Pasos)

Un instalador FV hace esto en orden:

1. **Va al tejado** → mide geometría, fotografía obstáculos
2. **Diseña el campo solar** → cuántas placas caben y con qué módulo
3. **Analiza las sombras** → descarta zonas, decide si necesita optimizadores
4. **Elige inversor, baterías y cableado** → dimensiona con la factura del cliente
5. **Genera la oferta y memoria** → precio, amortización, documentación legal

Esto mapea directamente a los **5 pasos canónicos de RA**.

---

## 2. Los 5 Pasos Canónicos

```
[1. EMPLAZAMIENTO] → [2. CAMPO SOLAR] → [3. ANÁLISIS SOLAR] → [4. INGENIERÍA] → [5. ENTREGA]
```

| Paso | Nombre | Icono | Contenido | Guard de entrada |
|:---:|:---|:---:|:---|:---|
| **1** | EMPLAZAMIENTO | 🏠 | Plano de trabajo (P1/P2/P3), trazado de faldones, obstáculos 3D | Siempre accesible |
| **2** | CAMPO SOLAR | ☀️ | Módulo FV, layout booleano, inclinación β, azimut, portrait/landscape | ≥1 faldón cerrado |
| **3** | ANÁLISIS SOLAR | 🌤️ | Factura del cliente, objetivo kWh, simulación anual heatmap | ≥1 panel en layout |
| **4** | INGENIERÍA | ⚡ | Inversor, batería, strings MPPT, cableado DC/AC, IEC 62548 | Objetivo definido |
| **5** | ENTREGA | 📄 | Balance financiero, memoria técnica, oferta comercial PDF | Inversor seleccionado |

---

## 3. Arquitectura de Módulos JS

```
js/workflow-orchestrator.js   ← Máquina de estados (5 pasos), guards, eventos
js/working-plane.js           ← Geometría: planos, faldones, tríada CAD       [Paso 1]
js/buildings.js               ← Edificios 3D                                   [Paso 1]
js/obstacles.js               ← Obstáculos 3D                                  [Paso 1]
js/solar-engine.js            ← Astronomía: posición solar, irradiancia        [Paso 2-3]
js/solar-heatmap.js           ← Simulación anual (156 instantes), heatmap      [Paso 3]
js/solar-materials.js         ← Shaders y texturas PBR paneles                 [Paso 2]
js/electrical-engine.js       ← Secciones REBT, caída de tensión               [Paso 4]
js/bill-auditor.js            ← Auditoría de facturas eléctricas               [Paso 3]
js/financials.js              ← CAPEX/OPEX, VAN, TIR                           [Paso 5]
js/docs-generator.js          ← Exportación PDF                                [Paso 5]
js/config.js                  ← Constantes y paletas globales
js/ra-engine.js               ← Núcleo de cálculo y exportación de datos
js/viewer.js                  ← Configuración Cesium (cámara, tiles, shadowMap)
```

---

## 4. Hoja de Ruta de Implementación

### 🔹 FASE A — Orquestador y Stepper (EN CURSO)

**Objetivo:** Reemplazar el stepper de 7 pasos en el DOM por el de 5 pasos canónicos.

**Tareas:**
1. Reescribir el bloque HTML del stepper en `index.html` (L421-L464): 5 botones con IDs `wp-step-1-btn` a `wp-step-5-btn`.
2. Crear/actualizar los 5 contenedores de herramientas (`wp-step-1-content` a `wp-step-5-content`):
   - `step-1-content`: fusiona Plano + Cubierta + Obstáculos del HTML antiguo.
   - `step-2-content`: mueve el layout de paneles y sliders β/azimut del antiguo Paso 6.
   - `step-3-content`: mueve auditoría de factura (antiguo Paso 4) + controles de heatmap.
   - `step-4-content`: mueve catálogo de equipos (antiguo Paso 5).
   - `step-5-content`: fusiona el antiguo Paso 7 (informe PDF).
3. Actualizar `workflow-orchestrator.js` para que `goToStep(1..5)` active los nuevos contenedores y guards.
4. Actualizar `wpGoToStep(n)` en `working-plane.js` para mapear n∈{1,2,3,4,5}.

**Punto de revisión A:** El usuario debe ver 5 botones en la barra y poder navegar entre ellos sin errores de consola.

---

### 🔹 FASE B — Paso 1: EMPLAZAMIENTO Consolidado

**Objetivo:** El Paso 1 concentra toda la geometría base del proyecto en un único panel organizado en tarjetas colapsables.

**Tarjetas del Paso 1:**
- 🏠 **Plano de Trabajo:** Botón "Definir Plano (3 clics)", lista de planos existentes, métricas de pendiente/azimut.
- ✏️ **Faldones / Cubierta:** Dibujo poligonal, lista de faldones, edición de vértices.
- 🧱 **Obstáculos 3D:** Selector de tipo, lista de obstáculos, gizmo de posicionamiento.

**Punto de revisión B:** Crear un plano, un faldón y colocar un obstáculo todo desde el Paso 1 sin cambiar de pantalla.

---

### 🔹 FASE C — Paso 2: CAMPO SOLAR

**Objetivo:** El Paso 2 gestiona la generación de la malla de paneles con sus parámetros físicos.

**Contenido del Paso 2:**
- Selector de módulo FV del catálogo.
- Sliders de inclinación β (0-90°) y azimut (0-360°) con lectura cardinal.
- Toggle Portrait/Landscape.
- Botón 🔄 Auto-layout y botón de reset coplanar.
- Métricas: nº paneles, kWp total, área ocupada.

**Punto de revisión C:** Cambiar el módulo y la inclinación y ver la malla 3D actualizada en tiempo real.

---

### 🔹 FASE D — Paso 3: ANÁLISIS SOLAR

**Objetivo:** El Paso 3 cierra el diseño físico antes de pasar a la ingeniería eléctrica.

**Contenido del Paso 3:**
- Importar factura eléctrica del cliente (PDF/CSV/JSON).
- Definir objetivo de instalación (máx. tejado / objetivo kWh / inversión máxima).
- Botón "Simular producción anual" → lanza `computeAnnualSolarHeatmap()`.
- Gráfico de barras mensual (kWh/mes).
- Diagnóstico MLPE: ¿optimizadores o microinversores?

**Punto de revisión D:** Cargar una factura, lanzar la simulación y ver el heatmap de colores en los paneles 3D.

---

### 🔹 FASE E — Paso 4: INGENIERÍA

**Objetivo:** Con la potencia pico real (kWp exacto del Paso 2), el sistema recomienda y valida el equipo eléctrico.

**Contenido del Paso 4:**
- Auto-recomendación de inversor (ratio DC/AC 1.15-1.25, canales MPPT, IEC 62548).
- Auto-recomendación de batería (kWh útil según factura).
- Validación Isc ≤ Imax,inversor y sobrecarga CTE (kg/m²).
- Trazado de cableado DC (+0.35m, glow neón) y evacuación AC.
- Telemetría: sección mm², ΔV%.

**Punto de revisión E:** Ver el cableado 3D trazado automáticamente y la validación eléctrica sin errores.

---

### 🔹 FASE F — Paso 5: ENTREGA

**Objetivo:** Generar la documentación final para el cliente y las autoridades.

**Contenido del Paso 5:**
- Resumen económico: CAPEX, OPEX, VAN, TIR, payback.
- Auditoría de factura: ahorro anual estimado en €.
- Exportar Memoria Técnica (PDF).
- Exportar Oferta Comercial (PDF) con logo de empresa.

**Punto de revisión F:** Exportar el PDF de Memoria y verificar que todos los datos del visor 3D están reflejados correctamente.

---

## 5. Reglas de Ejecución

1. **Una fase a la vez.** Esperar aprobación explícita del usuario antes de iniciar la siguiente.
2. **No romper lo que funciona.** El visor 3D, la tríada CAD y el gizmo universal son intocables salvo corrección de bugs.
3. **IDs DOM legacy:** Mantener todos los IDs referenciados desde JS (`wp-step-N-content`) funcionales durante la transición.
4. **El número de pasos es 5.** No añadir ni quitar pasos sin aprobación explícita del usuario.
