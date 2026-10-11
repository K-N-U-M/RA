# 🤖 AGENTS.MD: Guía para Agentes de IA en el Proyecto RA (Visor Solar 3D)

> **VERSIÓN CANÓNICA v3.0** — Este archivo es la única fuente de verdad para el flujo de trabajo y la arquitectura de RA.  
> Cualquier referencia a flujos de 6 o 7 pasos en otros documentos o en el código está **obsoleta y debe ignorarse**.

---

## 1. 🌐 Visión General del Proyecto

**RA (Visor 3D Fotovoltaico)** es una plataforma web de ingeniería solar de alta fidelidad que replica el flujo real de un instalador fotovoltaico profesional, combinando:

- **CesiumJS & WebGL:** Renderizado 3D sobre fotogrametría fotorrealista (Google Photorealistic 3D Tiles) y modelos de terreno digital (DTM/OSM).
- **Física Solar y Sombras AAA:** Posicionamiento astronómico en tiempo real (altura solar α, acimut γ, vector solar ENU), sombras GPU ultra-nítidas y overlays analíticos con `depthFailMaterial`.
- **Diseño CAD Asistido en Cubierta:** Planos de trabajo en 3 puntos (P1, P2, P3), faldones poligonales, snapping magnético, tríada ortonormal CAD (ejes U, V, N) y Gizmo Universal 2D/3D.
- **Empaquetamiento de Paneles:** Algoritmos booleano-geométricos, retranqueos euclídeos, paso inter-filas anti-autosombreado (solsticio de invierno) y orientaciones este-oeste (V-Dome).
- **Ingeniería Eléctrica REBT:** Strings por MPPT, enrutamiento leapfrog (UNE-EN 62305), secciones ZZ-F DC y RV-K AC, caída de tensión ≤1.5% (REBT ITC-BT-40).
- **Catálogo de Equipos:** CRUD de módulos, inversores, baterías, microinversores; singleton `window.equipmentCatalog` con persistencia `localStorage`.
- **Simulación Anual:** 192 instantes solares asíncrono no bloqueante, heatmap por panel, diagnóstico MLPE.
- **Presupuesto y Entrega:** CAPEX/OPEX, VAN, TIR, auditoría de facturas, exportación PDF.

---

## 2. 📁 Estructura del Repositorio

```
c:/TRABAJOS/RA/
├── index.html                       # Aplicación completa (HTML/CSS/JS monolito cliente)
├── AGENTS.md                        # ← ESTE ARCHIVO. Fuente de verdad para agentes IA.
├── MEMORY.md                        # Memoria viva del proyecto: decisiones, estado, deuda técnica
├── PLAN_MAESTRO_REESTRUCTURACION_FLUJO.md  # Plan de implementación por fases
├── MIGRATION_PLAN.md                # Riesgos y estrategia de migración técnica
├── MANUAL_TECNICO_INGENIERIA_RA.md  # Física solar y formulación matemática
├── css/styles.css                   # Estilos complementarios
├── js/
│   ├── workflow-orchestrator.js     # Máquina de estados del stepper (5 pasos)
│   ├── working-plane.js             # Planos de trabajo, faldones, tríada CAD
│   ├── capture-mode.js              # Modo captura limpia (oculta andamiaje CAD, tecla C)
│   ├── buildings.js                 # Edificios 3D y extrusión perimetral
│   ├── obstacles.js                 # Obstáculos 3D (chimeneas, HVAC, árboles)
│   ├── solar-engine.js              # Algoritmos astronómicos (Spencer, Perez, Hay-Davies)
│   ├── solar-heatmap.js             # Simulación anual y diagnóstico MLPE
│   ├── solar-materials.js           # Shaders y materiales PBR fotovoltaicos
│   ├── electrical-engine.js         # Secciones REBT, strings MPPT y reasignación balanceada
│   ├── undo-manager.js              # Deshacer borrados (obstáculos/edificios/paneles/vértices)
│   ├── bill-auditor.js              # Auditoría de facturas eléctricas
│   ├── financials.js                # CAPEX/OPEX, VAN, TIR, oferta comercial + resumen IA híbrido
│   ├── docs-generator.js            # Exportación de memorias y ofertas en PDF
│   ├── bom-tree.js                  # Árbol de materiales (BOM)
│   ├── project-hierarchy.js         # Scene graph jerárquico del proyecto
│   ├── ui-outliner.js               # Outliner de objetos de escena
│   ├── engineering-explainer.js     # Explicaciones guiadas de ingeniería
│   ├── config.js                    # Constantes globales y paletas
│   └── viewer.js                    # Configuración del visor Cesium
├── scratch/                         # Scripts de verificación automatizados
└── doc/                             # Documentación canónica de arquitectura
```

> [!IMPORTANT]
> **Gestión de Hooks Globales:** Las funciones invocadas desde atributos HTML (`onclick`, `onchange`) deben estar siempre accesibles en `window`. No eliminar ni renombrar sin actualizar el HTML.

---

## 3. 🗺️ FLUJO CANÓNICO DE 5 PASOS (Fuente Única de Verdad)

> **Este es el flujo definitivo.** Reemplaza cualquier referencia anterior a 6 o 7 pasos.  
> Deriva del flujo real de un instalador fotovoltaico profesional (IRL).

```
[1. EMPLAZAMIENTO] → [2. CAMPO SOLAR] → [3. ANÁLISIS SOLAR] → [4. INGENIERÍA] → [5. ENTREGA]
```

| Paso | ID Canónico | Nombre | Contenido | Pasos Antiguos Fusionados |
| :---: | :--- | :--- | :--- | :--- |
| **1** | `step-1` | 🏠 EMPLAZAMIENTO | Definir plano de trabajo (P1/P2/P3), trazar faldones/polilíneas, colocar obstáculos 3D | Pasos 1 + 2 + 3 del flujo anterior |
| **2** | `step-2` | ☀️ CAMPO SOLAR | Seleccionar módulo FV, generar layout booleano, ajustar inclinación β y azimut, portrait/landscape | Parte del Paso 6 anterior |
| **3** | `step-3` | 🌤️ ANÁLISIS SOLAR | Auditar factura del cliente, definir objetivo kWh/kWp, lanzar simulación anual (heatmap 192 instantes) | Pasos 4 + parte del 6 anterior |
| **4** | `step-4` | ⚡ INGENIERÍA | Dimensionar inversor/batería, validar strings MPPT, trazar cableado DC/AC, comprobación IEC 62548 | Paso 5 anterior |
| **5** | `step-5` | 📄 ENTREGA | Balance financiero (CAPEX/OPEX, VAN, TIR), memoria técnica y oferta comercial en PDF | Paso 7 anterior |

### Reglas de Navegación (Guards)
- **Paso 1 → 2:** Requiere ≥1 faldón cerrado con área > 0.
- **Paso 2 → 3:** Requiere ≥1 panel generado en el layout.
- **Paso 3 → 4:** Requiere ≥1 panel generado (el objetivo factura/kWh es opcional; así está implementado en `canEnterStep`).
- **Paso 4 → 5:** Requiere inversor seleccionado del catálogo.
- **Función de navegación:** `wpGoToStep(n)` donde n ∈ {1, 2, 3, 4, 5}.

---

## 4. 🎮 Estándares Gráficos de Renderizado (Calidad AAA)

Para erradicar parpadeos, moiré, shadow acne y z-fighting:

1. **shadowMap:** size=4096, softShadows=true, cascades=4, _fitNearFar=false, normalOffset=true. Bias físico: depthBias = 0.35m / maximumDistance (despegue constante de la sombra en metros, suelo 0.00015; realDist cuantizado a 10m). Ajuste en vivo: wpShadowDiagnostics() / wpSetShadowBiasMeters(m). **Nota:** la configuración estática inicial usa 0.0006 @ 2000 m (≈1,2 m de despegue) hasta el primer `preUpdate` dinámico (rango real 0.00015–0.000875).
2. **Z-Buffer:** `camera.frustum.near = 0.5` — nunca usar 0.01 o 0.1 en escenas de cubierta.
3. **polygonOffset en paneles:** `{ enabled: true, factor: -2.0, units: -2.0 }`.
4. **UV ortogonal 1:1:** Cada panel es una `Cesium.Geometry` cuadrilátera analítica (no `PolygonGeometry`) con UVs `[0,0],[1,0],[1,1],[0,1]`.
5. **depthFailMaterial:** Todos los overlays de sombra (`pv_panel_shadow_overlay_`, `dyn_obs_shadow_`, `dyn_bld_shadow_`) usan `material` y `depthFailMaterial` iguales con `perPositionHeight:true` y `arcType:NONE`.
6. **Skybox procedural:** `createProceduralSkybox()` sustituye el espacio negro por degradado Rayleigh + nubes cumuliformes.

---

## 5. 🎯 Gizmo Universal (Single Source of Truth)

- **`renderUniversalGizmo2D`** es la única fuente de verdad para el objeto seleccionado.
- Aplica a: obstáculos, árboles, edificios, inversor, cuadro DC, contador, paneles individuales.
- **Regla de arrastre:** Durante `MOUSE_MOVE`, NUNCA destruir primitivas GPU. Solo actualizar coordenadas matemáticas. La reconstrucción pesada (sombras, cables, layout) se difiere a `LEFT_UP`.
- **Supresión de etiquetas (PENDIENTE DE IMPLEMENTAR):** objetivo documentado, pero hoy NO existe en código (`selectObstacle`/`selectPanel`/`selectBuilding` no tocan `label.show`). No asumir que funciona.

---

## 6. 🔥 Simulación Anual, Física Solar y Heatmap

- **192 instantes:** 12 meses × 16 horas. Asíncrono no bloqueante a 60 FPS con time-slicing.
- **Física Vectorial Real por Panel:** Cálculo del ángulo de incidencia $\cos\theta = \vec{s}_{\text{sol}} \cdot \vec{n}_{\text{panel}}$ usando la normal 3D individual de cada módulo ($\beta, \gamma$), diferenciando estructuras inclinadas (ej. $37^\circ$ Sur) de paneles coplanares ($0^\circ$).
- **Energía Neta Real (Single Source of Truth):** Cada panel calcula su producción anual neta `p.annualKwh` integrando radiación $G_{\text{POA}}$, modelo IAM (Fresnel), factor térmico $T_{\text{célula}}$ y raycast 3D de sombras con filtro de despegue $\delta = 0.35\,\text{m}$. La suma de todos los paneles sincroniza directamente con el balance del proyecto (`recalculateSolarYield`), preservando la simulación frente a sobreescrituras promediadas.
- **Cancelación Atómica y Eficiencia AABB:** Bucle asíncrono gobernado por `_activeSimGenerationId` para anular corrutinas huérfanas en concurrencia. Sombreado 2D optimizado con descarte AABB broadphase antes de colisión polinomial. Normalización temporal por $\Delta t$ (`hourStepDt`) en todos los modos de calidad.
- **Inspección 3D por Hover (Zero Clutter):** La escena 3D se mantiene limpia mostrando solo la gradación cromática del mapa de calor. Al pasar el cursor (*hover*) sobre cualquier panel, se activa el tooltip interactivo con: kWh/año, % sombra, inclinación/acimut y diagnóstico MLPE. Incluye toggle opcional `[🔘 Solo Hover / ⚪ Ver Todas]`.
- **Activación:** En Paso 3 (Análisis Solar), botón `computeAnnualSolarHeatmap()`.
- **Invalidación (desde 29/09/2026):** `window.wpInvalidateHeatmap(reason)` se invoca al mutar obstáculos/edificios/vértices/drageos; marca `solarSimState.annualHeatmapDirty`, muestra toast y los PDFs advierten análisis obsoleto.

---

## 7. 🧮 Catálogo y Auto-Dimensionamiento

Estado en `window.solarProjectConfig`:

```javascript
{
  selectedModuleId, selectedInverterId, selectedMicroinverterId, selectedBatteryId,
  selectedTopology,    // 'inverter' | 'microinverter' | 'optimizer'
  selectedObjective,   // 'optimal_inv' | 'max_roof' | 'zero_shades' | 'target_kwh'
  targetKwp,
  autoSizing: { inverters, microinverters, batteries },  // { count, autoCount, isManual }
  calculatedLimits: { nMinString, nMaxString, nMaxTotalModules }
}
```

- **Inversores:** N = ⌈P_kWp / (kW_nom × ratio_overload)⌉.
- **Microinversores:** Basado en topología de entradas (1-en-1, 2-en-1, 4-en-1).
- **Baterías:** ~1 kWh/kWp capacidad útil recomendada.
- **Reset:** botón 🔄 Auto → `wpResetAutoSizing(type)`.
- **Singleton catálogo:** `window.equipmentCatalog` sincronizado con `localStorage('ra_equipment_catalog')`.

---

## 8. ⚡ Cableado REBT (ITC-BT-40) y Motor 3D Volumétrico (`RACableEngine`)

> **Arquitectura de Enrutamiento Híbrido:**
> - **Micro-enrutamiento (Inter-módulo):** Los latiguillos que conectan un panel con el siguiente dentro del string (el "cosido") MANTIENEN el renderizado visual legacy de curvas de Bézier orgánicas y shaders de flujo animado (`index.html`). NO extirpar este código visual, es una decisión estética consolidada.
> - **Macro-enrutamiento (Troncal "Home Runs"):** Las tiradas principales (DC+ y DC- de retorno) que bajan del inicio y fin del string (IN/OUT) hacia el Cuadro DC/Inversor, y la Evacuación AC, DEBEN usar el trazado físico ortogonal Manhattan 3D, controlado en exclusiva por `RACableEngine`.

| Tramo | Cable | Secciones | ΔV max | Cota y Geometría |
|---|---|---|---|---|
| DC+ (módulos → inversor) | ZZ-F 1500V Cu clase 5 | 4, 6, 10, 16, 25 mm² | 1.5% | +0.35m sobre plano · Tubo 3D cilíndrico r=1.8cm (`#EF4444`) |
| DC- (retorno compensado) | ZZ-F 1500V Cu clase 5 | 4, 6, 10, 16, 25 mm² | 1.5% | +0.45m sobre plano · Tubo 3D cilíndrico r=1.8cm (`#0284C7`) |
| Troncal Combiner / Y | ZZ-F 1500V Cu clase 5 | 10, 16, 25 mm² | 1.5% | +0.40m sobre plano · Bandeja en U 8x3cm (`#10B981` / `#64748B`) |
| AC (inversor → contador) | RV-K 0.6/1kV | 2.5, 4, 6, 10, 16, 25, 35, 50 mm² | 1.5% | +0.35m sobre paramento · Tubo 3D r=2.5cm (`#38BDF8`) |

- **Motor Modular Canónico:** `js/cable-engine.js` (`window.RACableEngine`).
- **Geometría 3D Volumétrica con Sombras:** Toda conducción usa `Cesium.PolylineVolumeGraphics` con `shadows: Cesium.ShadowMode.ENABLED`, generando mallas reales con normales 3D que proyectan sombras solares físicas sobre tejas y fachadas.
- **Trazado Ortogonal 90° (Manhattan Routing 3D):** Aplica al cableado troncal. Descompuesto en los ejes U, V y N del faldón activo y bajantes verticales por fachada.
- **Colores Planos Sólidos:** Para los tubos ortogonales (sin shaders procedurales que desincronicen el render WebGL).
- **Tipologías Eléctricas:** Serie pura (1S por MPPT), Paralelo en cubierta con Conectores Y (2S), Combiner Box (cuadro de strings) y Línea de Evacuación AC.
- **Snapping Magnético y Auto-Trazado:** Snapping al terminal de string o nodo Y en trazado manual, y auto-generación zero-click con codos editables (`ra_route_handle_*`).
- Corriente de diseño DC: Id = 1.25 × Isc.
- Resistividad Cu a 90°C: ρ = 0.023 Ω·mm²/m.

---

## 8.1 🏗️ Motor de Estructuras 3D Paramétricas y Ángulo Adaptativo

- **Pipeline GPU:** Renderizado directo mediante primitivas WebGL iewer.scene.primitives.add(new Cesium.PolylineCollection()) con material Cesium.Material.fromType('Color') (idéntico a RACableEngine), asegurando visibilidad incondicional sobre Google Photorealistic 3D Tiles y mallas DTM.
- **Geometría A-Frame Cerrada:**
  - Clasificación altimétrica barométrica de los 4 vértices del panel para desacoplar aristas inferiores de superiores.
  - Escuadras triangulares cerradas por cada lateral del módulo: Arista baja $\\rightarrow$ Zapata de lastre en suelo $\\rightarrow$ Zapata de lastre trasera $\\rightarrow$ Montante trasero $\\rightarrow$ Arista baja.
  - Viga riostra horizontal frontal conectando los apoyos de base en suelo para arriostramiento contra viento.
- **Tipologías Soportadas e Inclinación Adaptativa:**
  - coplanar_teja / coplanar_chapa: Doble perfil longitudinal de aluminio bajo el panel (al 25% y 75% del módulo, cota -2.5cm). Inclinación y azimut acoplados al faldón.
  - 	riangles_30: Triángulos fijos a 30° orientación Sur (180°).
  - 	riangles_15_ew: Estructura simétrica a 15° con orientación Este-Oeste (90° / 270°).
  - 	riangles_custom: Triángulos A-Frame paramétricos con ángulo adaptable (1°–60°) gobernados dinámicamente por el slider de inclinación (cfg-p2-tilt-slider).
  - pergola: Pórtico de pilares verticales en las 4 esquinas del módulo descendiendo a la cota exacta de cubierta con altura libre configurable (default 1.80m).
- **Sincronización Cinemática Bidireccional:** El selector aldon-structure-select y el slider de inclinación se sincronizan recíprocamente, recalculando la geometría 3D, el caché analítico y el desglose de materiales BOM de forma reactiva.

---

## 9. ⌨️ Atajos de Teclado

| Tecla | Acción | Contexto |
| :---: | :--- | :--- |
| `T` | Toggle textura PBR paneles | Paso 2 y 3 |
| `L` / `H` | Toggle labels 3D de paneles | Global |
| `C` | Toggle modo CAPTURA LIMPIA (`window.RACapture`): oculta vértices, polilíneas, planos y tríada para screenshots; botón flotante 📷 | Global |
| `Escape` | Cancelar herramienta / deseleccionar / deshacer punto en dibujo | Global |
| `Delete/Backspace` | Borrar elemento seleccionado — despachador único: vértice de faldón → obstáculo → objetivo del gizmo universal (edificio/equipo/panel) → panel | Selección activa |
| `Ctrl+Z` | Deshacer último borrado (`window.RAundo`); si no hay borrados, undo geométrico legacy; en dibujo, quita el último punto | Global |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Rehacer geometría legacy | Modo idle |
| `Shift` (mantener clic) | Habilita acciones de ratón con Shift (rotación de gizmo con snap 15°) | Gizmo |

> NOTA: `S` NO activa snapping (es retroceso de cámara WASD); el snapping ortogonal del dibujo de edificios es automático e incondicional. `Ctrl+Click` fino en eje N NO está implementado.

---

## 10. 🛠️ Reglas Obligatorias para Agentes

1. **CRLF en Windows:** `index.html` usa `\r\n`. Usar regex `\r?\n` en scripts Node.js.
2. **Hooks globales:** Mantener siempre accesibles en `window` las funciones llamadas desde HTML inline.
3. **No tocar código sin aprobación:** Exponer diagnóstico, proponer opciones y esperar `"adelante"`.
4. **Número de pasos = 5, siempre.** Ignorar cualquier referencia a 6 o 7 pasos en código legacy.
5. **Normativa:** IEC 62548, REBT ITC-BT-40, UNE-EN 62305, CTE DB-SE-AE. No saltarse límites de tensión en frío (-10°C) ni de caída de tensión.
6. **Congelación del bloque inline (REGLA DURA, 29/09/2026):** ningún código nuevo en el bloque `<script>` inline de `index.html` (desde ~línea 2230). Toda función nueva va en un módulo `js/*.js` con su `<script>` tag y export a `window`/`RA`. El inline existente solo se toca para corregir bugs o insertar llamadas de una línea a APIs de módulos.
7. **SSOT de producción:** la producción anual canónica es `getProjectCalcs().annualKWh` (definición canónica en index.html; docs-generator, financials y bill-auditor la consumen por delegación). Ningún documento recalcula producción por su cuenta; `kwp × 1450` es únicamente fallback sin diseño. La asignación de strings a canales MPPT se rebalancea con `RA.Electrical.rebalanceMPPTAssignment` (faldón junto si cabe, reparto si no).
8. **Invalidación del heatmap:** al mutar geometría (obstáculos, edificios, vértices, drags) se llama `window.wpInvalidateHeatmap(reason)` → `solarSimState.annualHeatmapDirty`. El Paso 3 y los generadores de PDF advierten si el análisis está obsoleto. No reintroducir cálculos sobre heatmap inválido.

---

## 11. 📚 Documentación Canónica

| Documento | Contenido |
| :--- | :--- |
| `AGENTS.md` | ← Este archivo. Flujo, arquitectura y reglas para IA. |
| `MEMORY.md` | Memoria viva: decisiones de diseño, estado, SSOT map, deuda técnica. |
| `PLAN_MAESTRO_REESTRUCTURACION_FLUJO.md` | Hoja de ruta de implementación por fases |
| `MIGRATION_PLAN.md` | Análisis de riesgo y estrategia de migración técnica |
| `MANUAL_TECNICO_INGENIERIA_RA.md` | Física solar y formulación matemática detallada |
| `doc/01-especificaciones.md` | Especificaciones funcionales y no funcionales |
| `doc/02-tecnologia.md` | Stack tecnológico y módulos |
| `doc/03-arquitectura.md` | Arquitectura, estado global y renderizado |
| `doc/04-convenciones.md` | Convenciones de código obligatorias |
