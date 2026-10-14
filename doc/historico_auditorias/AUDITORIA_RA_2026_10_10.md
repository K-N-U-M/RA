# 📋 AUDITORÍA INTEGRAL DE COMPETENCIA: PROYECTO "RA" (Visor Solar 3D)
**Fecha:** 10 de Octubre de 2026
**Auditor:** Ingeniero Senior Fotovoltaico & Arquitecto de Software
**Alcance:** Interfaz, Flujo de Trabajo, Lógica Física, Ingeniería Eléctrica, Modelos Financieros y Arquitectura.

---

## 1. 🖥️ Diseño de Interfaz y Flujo de Trabajo (UI/UX)
El modelo de 5 pasos canónicos (Emplazamiento ➜ Campo Solar ➜ Análisis Solar ➜ Ingeniería ➜ Entrega) replica a la perfección el flujo de caja de trabajo (EPC) de una ingeniería fotovoltaica moderna.

🟢 **Fortalezas:**
*   **Aislamiento del usuario:** Dividir el proceso impide la sobresaturación cognitiva (típico error de *PVsyst* o *Helioscope*, que abren docenas de menús emergentes).
*   **Gizmo 2D/3D (Single Source of Truth):** El uso de manipuladores tridimensionales sobre CesiumJS para extrudir edificios o rotar paneles es puntero.

🔴 **Áreas de mejora:**
*   **Falta de "Undo/Redo" Robusto:** Si bien existe `undo-manager.js`, en software CAD web es vital poder retroceder acciones complejas (como recálculos de strings o layout).
*   **Bloqueos de renderizado:** Al mover grandes arrays de paneles con el Gizmo, si los listeners no se deboucean, WebGL puede perder frames (Z-fighting y shadow-acne ya mitigado, pero el reflow duele).

---

## 2. ☀️ Física Solar, Cálculos Matemáticos y Heatmap
El uso de un heatmap de 192 instantes anuales (asíncrono, *time-slicing*) para el análisis de sombras es el mayor acierto de rendimiento del proyecto.

🟢 **Fortalezas:**
*   **Vector Solar Real por Panel:** Cálculo del ángulo de incidencia ($\cos\theta$) con normales individuales tridimensionales (Pitch/Azimuth exactos). No se asume que todos los paneles de un tejado son coplanares matemáticamente.
*   **Factor IAM (Incidence Angle Modifier) y Térmico:** Inclusión de cálculos reales de `Tcell` y degradación por temperatura (`gamma` y $NOCT$).

🔴 **Áreas de mejora:**
*   **Radiación Difusa y Albedo:** El modelo asume un albedo estático (generalmente 0.20) y carece de un modelo difuso complejo (tipo Perez o Hay-Davies) a nivel celda. En zonas nubladas, la difusa importa muchísimo.
*   **Discretización de Sombras (192 instantes):** 16 horas x 12 meses es suficiente para un balance mensual, pero para un cálculo de ROI industrial, un *Raycasting* de 8760 horas (cada hora del año) es el estándar *bankable*.

---

## 3. ⚡ Ingeniería Eléctrica (DC/AC y REBT)
El motor de enrutamiento y particionamiento de strings (`electrical-engine.js` y el Manhattan routing 3D) es altamente diferenciador.

🟢 **Fortalezas:**
*   **Leapfrog / Snake Routing:** La implementación de partición de strings (con algoritmos TSP o Snake) para minimizar el bucle de inducción electromagnética (IEC 62305) es un hito técnico brutal que pocos competidores comerciales tienen automatizado a este nivel visual.
*   **Volumetría de Cableado:** Las bajantes ortogonales 3D que proyectan sombras (REBT ITC-BT-40).

🔴 **Áreas de mejora:**
*   **Clipping (DC/AC Ratio):** El "Auto-sizing" recomienda inversores según un límite de potencia, pero el clipping real dinámico (donde la potencia DC supera a la AC al mediodía en verano) necesita estar integrado directamente en la curva de *yield* del heatmap para no sobredimensionar inversores y encarecer el CAPEX.
*   **Cálculos de Caída de Tensión Simplificados:** `calculateVoltageDrop` usa resistencia pura (Cobre a 90ºC, $\rho=0.023$). Para tendidos largos de AC, la reactancia inductiva ($X_L$) del cable también afecta y no parece estar contabilizándose para cumplir de manera ultra precisa el 1.5%.

---

## 4. 💶 Modelo Financiero y Entregables
🟢 **Fortalezas:**
*   Generador PDF nativo y exportador enriquecido con inteligencia artificial (Gemini) en el Paso 5.
*   Histogramas y gráficos *Waterfall* de pérdidas dinámicos SVG (cero dependencia de librerías lentas de Canvas).

🔴 **Áreas de mejora:**
*   **Degradación Acoplada a Inflación:** El TIR y VAN asumen precios de energía estáticos o con inflación simple. Para PPA o tarifas indexadas (pool), el precio horario es vital.
*   **Gestión del Autoconsumo Horario:** La curva diaria de demanda frente a producción es muy simplificada si no permite ingestar curvas de carga `.csv` del cliente cuarto-horarias.

---

## 5. 🛠️ PLAN DE ACCIÓN POR FASES (Propuesta de Refactorización Técnica)

**FASE 1: Consolidación de Ingeniería Eléctrica**
1. Refactor de `calculateVoltageDrop` para incluir reactancia y factor de potencia en tramos de alterna (AC).
2. Mejora del algoritmo de *Clipping* en la simulación 192-step para reportar la energía truncada.

**FASE 2: Precisión Financiera (Bankability)**
1. Módulo de perfiles de carga: Permitir al usuario subir un CSV con el consumo 24/7/365 para cruzarlo con el heatmap.
2. Integrar la degradación anual del silicio (~0.5%/año) en el cálculo iterativo del VAN y flujos de caja en `calcNPV()`.

**FASE 3: Optimización WebGL y Precisión Solar**
1. Actualización de 192 a 365 instantes (1 día al mes no representa con exactitud la variabilidad en primaveras/otoños). Para ello, implementar un Web Worker para el raycasting 3D que libere el hilo principal.
2. Añadir modelos de radiación de "Perez" para irradiancia difusa (imprescindible en fachadas o V-Dome este-oeste).

**FASE 4: UI / UX Avanzada**
1. Panel de "Deshacer/Rehacer" global en pantalla con historial de cambios (Undo History UI).
2. Minimapa o atajos de teclado siempre visibles.
