# 01. Especificaciones de la Aplicación

> **VERSIÓN CANÓNICA v3.0** — El flujo de trabajo es de **5 pasos**. Ignorar cualquier referencia anterior a 6 o 7 pasos.

## 1. Propósito

**RA (Visor 3D Fotovoltaico)** es una plataforma web monolítica de **ingeniería fotovoltaica asistida**, que combina:

- Modelado 3D georreferenciado con **CesiumJS** sobre fotogrametría (Google Photorealistic 3D Tiles) y DTM/OSM.
- Física solar astronómica en tiempo real (altura solar, acimut, sombras GPU).
- Diseño CAD asistido sobre cubierta (planos de trabajo, faldones, obstáculos).
- Empaquetado automático de paneles con algoritmos geométricos de contención 2D.
- Ingeniería eléctrica DC/AC conforme a REBT / IEC 62548 / CTE.
- Simulación anual (12 meses × 16 horas = 192 instantes), diagnóstico MLPE y generación de informe/presupuesto PDF.

La aplicación opera **100% en el navegador, sin backend**. La persistencia se realiza en `localStorage`.

## 2. Usuarios objetivo

| Rol | Uso principal |
| :--- | :--- |
| Ingeniero solar / proyectista | Diseño de instalación FV sobre cubierta, cálculo de producción y presupuesto. |
| Técnico comercial | Generación de oferta técnico-económica y memoria en PDF. |

## 3. Flujo de Trabajo — 5 Pasos Canónicos

El producto está estructurado como un asistente secuencial controlado por `wpGoToStep(step)` donde `step ∈ {1, 2, 3, 4, 5}`:

| Paso | Nombre | Funcionalidad |
| :---: | :--- | :--- |
| **1** | 🏠 EMPLAZAMIENTO | Definir plano de trabajo (3 clics P1/P2/P3), trazar faldones poligonales, colocar obstáculos 3D (chimeneas, HVAC, árboles, aerogeneradores). |
| **2** | ☀️ CAMPO SOLAR | Seleccionar módulo FV del catálogo, generar layout booleano, ajustar inclinación β y azimut, portrait/landscape, visualización 3D de la malla. |
| **3** | 🌤️ ANÁLISIS SOLAR | Importar factura eléctrica del cliente, definir objetivo kWh/kWp, lanzar simulación anual (192 instantes), visualizar heatmap y diagnóstico MLPE. |
| **4** | ⚡ INGENIERÍA | Dimensionar inversor y batería, validar strings MPPT, calcular y trazar cableado DC/AC, comprobación IEC 62548 y CTE. |
| **5** | 📄 ENTREGA | Balance financiero (CAPEX/OPEX, VAN, TIR), exportación de Memoria Técnica y Oferta Comercial en PDF. |

### Guards de navegación
- **1 → 2:** ≥1 faldón cerrado.
- **2 → 3:** ≥1 panel generado.
- **3 → 4:** Objetivo definido (factura o kWh target).
- **4 → 5:** Inversor seleccionado del catálogo.

## 4. Funcionalidades clave

### 4.1 Visor 3D y renderizado (calidad AAA)
- CesiumJS Scene3D con tiles fotorrealistas, DTM/OSM y `depthTestAgainstTerrain`.
- Sombras GPU: `shadowMap` 4096, PCF suave, `polygonOffset` anti-moiré, overlays con `depthFailMaterial`.
- Overlay 2D en `canvas#ra-triad-overlay` (z-index 999999, `pointer-events:none`) para cursor CAD, tríada y gizmo universal.
- 60 FPS objetivo; throttling de `pickPosition` (~32 ms) y heatmap asíncrono no bloqueante.

### 4.2 CAD asistido en cubierta (Paso 1)
- Planos de trabajo en 3 clics con snapping magnético y ortogonal (Shift).
- Enderezador rápido de pendiente en 1 clic: fijación directa a 0° (plana), 15° (nave), 25° (teja) y 30° (tradicional) con recálculo de la normal geocéntrica.
- Tríada ortonormal U/V/N y gizmo universal de manipulación con arrastre en 3 ejes.
- Detección de contorno de obstáculos en cubierta: comprobación en tiempo real de si un obstáculo permanece dentro de un faldón cerrado (`✓ En cubierta` / `⚠️ Fuera de cubierta`).
- Imán de obstáculos a cubierta: centrado automático en el faldón activo para evitar elementos flotantes en el vacío.
- Edición de vértices de edificios: selección por proximidad ≤24 px, gizmo ámbar, borrado con Supr.

### 4.3 Generación de campo solar (Paso 2)
- Contención 2D estricta (sin invasión de patios ni aristas cóncavas).
- Retranqueos euclídeos perimetrales y paso inter-filas anti-autosombreado (solsticio de invierno).
- Orientaciones este-oeste (V-Dome) y estrategias: `optimal_inv`, `max_roof`, `zero_shades`, `target_kwh`.
- Comparador visual inmediato de orientación: evaluación simultánea vertical vs horizontal con recuento de módulos, potencia kWp y recomendación automática de mayor aprovechamiento.
- Pasillos de mantenimiento en 1 clic: pasillo central despejado de 0.80 m por faldón o replicado globalmente para accesibilidad y seguridad en obra.

### 4.4 Análisis solar y factura (Paso 3)
- Simulación asíncrona en 192 instantes solares con heatmap de irradiancia por panel.
- Diagnóstico MLPE: umbral de sombra heterogénea para recomendar optimizadores/microinversores.
- Importación de factura: PDF/CSV/JSON → curva de consumo horario y objetivo de autoconsumo.

### 4.5 Ingeniería eléctrica (Paso 4)
- Strings por ventana MPPT en frío a −10 °C (IEC 62548 / CTE).
- Conductores ZZ-F 1500V DC y RV-K 0.6/1kV AC con ΔV ≤ 1.5% (REBT ITC-BT-40).
- Enrutamiento leapfrog anti-bucle inductivo (UNE-EN 62305).
- Trazado 3D visible a +0.35m con `PolylineGlowMaterialProperty`.

### 4.6 Entrega y presupuesto (Paso 5)
- CAPEX/OPEX, VAN, TIR, amortización.
- Exportación PDF de Memoria Técnica y Oferta Comercial con logo de empresa.

## 5. Requisitos no funcionales

| Categoría | Requisito |
| :--- | :--- |
| Rendimiento | 60 FPS en navegación orbital; picks GPU ≤30/s; simulación no bloqueante. |
| Precisión | Matemática vectorial doble precisión (ENU); normalización estricta. |
| Normativa | CTE DB-SE-AE, REBT ITC-BT-40, IEC 62548, UNE-EN 62305. |
| Portabilidad | Un único `index.html` + JS clásico; sin backend; persiste en `localStorage`. |
| Mantenibilidad | Módulos JS desacoplados por responsabilidad; orquestador central en `workflow-orchestrator.js`. |
| Auditabilidad | Hooks globales explícitos en `window`; sin minificación; comentarios estructurales. |