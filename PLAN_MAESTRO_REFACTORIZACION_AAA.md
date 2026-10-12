# 🏗️ PLAN MAESTRO DE REFACTORIZACIÓN ARQUITECTÓNICA, SIMPLIFICACIÓN Y MODULARIZACIÓN AAA

> **Documento Canónico de Estrategia Técnica**  
> Objetivo: Transformar la arquitectura del visor solar en un sistema modular, escalable, libre de duplicidades y de alto rendimiento (60 FPS estables, carga instantánea y fuente única de verdad).

---

## 🧭 Diagnóstico de Arquitectura

Tras la auditoría integral de calidad y rendimiento, se identificaron cuatro áreas críticas de intervención:
1. **Duplicidad de funciones críticas:** Múltiples implementaciones paralelas de algoritmos eléctricos, formateo de métricas y cálculos de proyecto repartidos entre el bloque embebido y los módulos independientes.
2. **Monolito de script inline:** Un volumen superior a 600 KB de lógica JavaScript reside en la página principal, impidiendo la caché modular del navegador y ralentizando la inicialización.
3. **Retención de memoria GPU/3D:** Creación dinámica de entidades y primitivas sin liberación determinista en transformaciones sucesivas de diseño.
4. **Acoplamiento entre etapas:** Comunicación mediante invocaciones directas y dependencias cruzadas en lugar de un despachador reactivo central.

---

## 🎯 Hoja de Ruta de Implementación (4 Fases)

### 📌 Fase 1: Erradicación de Funciones Duplicadas (Unicidad Canónica SSOT)
**Objetivo:** Asegurar que cada algoritmo matemático, eléctrico o financiero exista en un único lugar exacto y exporte al namespace global/módulo correspondiente.

- **1.1 Motores de cableado y límites MPPT:**
  - Consolidar en el módulo de ingeniería eléctrica (`js/electrical-engine.js`) las funciones de partición en strings, orden snake y cálculo de límites dinámicos de inversor.
  - Eliminar las implementaciones redundantes del bloque inline de la página principal.
- **1.2 Cálculo de métricas del proyecto:**
  - Garantizar que la definición canónica del cálculo integral del proyecto resida en su módulo de origen y que tanto el generador documental como los módulos financieros consuman exclusivamente esa instancia.
- **1.3 Utilidades de interfaz y estado de carga:**
  - Unificar las funciones de indicadores de progreso y visibilidad en el módulo de configuración y utilidades generales.

---

### 📌 Fase 2: Modularización Progresiva y Aligeramiento de la Interfaz
**Objetivo:** Extraer la lógica de negocio atrapada en la página principal hacia submódulos con responsabilidades bien delimitadas.

- **2.1 Separación por dominios:**
  - Módulo de interacción 3D y herramientas de dibujo (gestión de clics, snapping y HUD de dibujo).
  - Módulo de control de escena y visibilidad (modos de captura, capas y etiquetas).
  - Módulo de eventos del usuario e inicialización de la interfaz.
- **2.2 Reducción del tamaño de la página inicial:**
  - La página principal mantendrá la estructura visual, estilos y carga de scripts externos, dejando la lógica operativa distribuida en archivos independientes cacheables.

---

### 📌 Fase 3: Recolector y Reciclador de Memoria Gráfica 3D (Pipeline 60 FPS)
**Objetivo:** Cero fugas de memoria y rendimiento suave sostenido en sesiones prolongadas y cubiertas industriales.

- **3.1 Limpieza determinista de primitivas Cesium:**
  - Al reconstruir layouts o cambiar orientaciones (vertical/horizontal/pasillos), destruir y liberar explícitamente geometrías, texturas y buffers anteriores de la GPU antes de asignar nuevos.
- **3.2 Reutilización de mallas y matrices en arrastres:**
  - Mantener la regla de no asignación durante el movimiento de objetos en tiempo real, actualizando únicamente matrices de transformación.
- **3.3 Caché analítica por cuadrantes:**
  - Invalidación selectiva: solo recalcular sombreados y distancias de los elementos que hayan mutado.

---

### 📌 Fase 4: Sistema Reactivo de Estado Centralizado (Flujo Zero-Click)
**Objetivo:** Sincronización automática e instantánea entre las 5 etapas del flujo de trabajo.

- **4.1 Despachador de eventos de proyecto:**
  - Un bus de eventos central (`ProyectoMutadoEvent`, `GeometriaActualizadaEvent`, `EquiposCambiadosEvent`).
- **4.2 Reacción en cadena sin intervención manual:**
  - Si se añade un obstáculo en el Paso 1, el layout del Paso 2 se adapta, el análisis del Paso 3 invalida su estado, la ingeniería del Paso 4 recalcula strings y el Paso 5 actualiza costes en tiempo real.
- **4.3 Persistencia atómica:**
  - Sincronización transparente con el almacenamiento local del navegador para recuperación de sesión sin pérdida de datos.

---

## 📋 Criterios de Aceptación y Validación
- Validación estricta de sintaxis en todos los módulos sin errores de compilación.
- Integridad total de las llamadas desde atributos visuales de la interfaz.
- Ausencia de discrepancias numéricas entre la vista tridimensional, los resúmenes ejecutivos y los documentos oficiales.
- Reducción medible del tiempo de inicialización de la herramienta en el navegador.
