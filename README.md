# ☀️ RA — Visor 3D Fotovoltaico de Alta Fidelidad & Ingeniería Solar AAA

> **Plataforma web profesional para ingeniería, diseño CAD en cubierta, análisis astronómico de sombras y dimensionado eléctrico/financiero de instalaciones solares fotovoltaicas.**

---

## 🌐 Visión General

**RA** es una estación de trabajo de ingeniería solar en el navegador que replica con precisión milimétrica el flujo de trabajo de un instalador e ingeniero proyectista fotovoltaico profesional. Combina el renderizado geoespacial 3D fotorrealista sobre fotogrametría mundial con cálculo analítico de sombras, optimización de layouts coplanares e inclinados, dimensionado eléctrico según normativa REBT/IEC y balance financiero de amortización.

### 🚀 Capacidades Principales
- **Entorno 3D Fotorrealista:** Basado en **CesiumJS & WebGL**, con integración de Google Photorealistic 3D Tiles y elevaciones DTM de alta resolución.
- **Física Solar Astronómica:** Modelo de Spencer y algoritmos de Perez/Hay-Davies con cálculo continuo del vector solar ENU, altitud $\alpha$ y acimut $\gamma$.
- **Simulación Anual Time-Sliced (Heatmap):** 192 instantes astronómicos anuales procesados de forma asíncrona a 60 FPS sin congelación de la interfaz gráfica.
- **Diseño CAD Asistido en Cubierta:** Definición de planos en 3 puntos ($P_1, P_2, P_3$), base ortonormal $(U, V, N)$, snapping magnético de aristas y Gizmo Universal 2D/3D con modos traslación y rotación.
- **Ingeniería Eléctrica REBT (ITC-BT-40):** Casación de inversores por sobrecarga (115%–130%), cálculo dinámico de strings MPPT con comprobación de $V_{oc}$ en frío a -10°C, agrupaciones de cables en corriente continua (ZZ-F) y alterna (RV-K), y caída de tensión $\le 1.5\%$.
- **Catálogo Unificado:** Módulos, inversores string, microinversores MLPE y baterías LFP con sincronización reactiva y persistencia local (`localStorage`).
- **Entrega Documental:** Generación directa de Memorias Técnicas Oficiales, Ofertas Comerciales, Esquemas Unifilares bajo norma IEC 60617 y presupuestos detallados en PDF.

---

## 🗺️ Flujo Canónico de Ingeniería (5 Pasos)

El flujo sigue estrictamente la arquitectura canónica v3.0 ([`AGENTS.md`](AGENTS.md)):

```
[1. EMPLAZAMIENTO] ──► [2. CAMPO SOLAR] ──► [3. ANÁLISIS SOLAR] ──► [4. INGENIERÍA] ──► [5. ENTREGA]
```

1. **🏠 1. EMPLAZAMIENTO:** Definición geométrica de planos de trabajo sobre la cubierta, trazado de faldones perimetrales y colocación de obstáculos 3D (chimeneas, casetones, HVAC, árboles).
2. **☀️ 2. CAMPO SOLAR:** Selección de panel FV del catálogo, empaquetado booleano anti-colisión, configuración de inclinación ($\beta$), azimut ($\gamma$), paso inter-filas (pitch solsticio de invierno) y orientación vertical/horizontal.
3. **🌤️ 3. ANÁLISIS SOLAR:** Auditoría de facturas eléctricas, fijación de objetivos energéticos (kWh/kWp) y simulación anual de sombras (heatmap de 192 instantes con diagnóstico MLPE).
4. **⚡ 4. INGENIERÍA:** Casación automática de inversores, dimensionado de acumuladores, cálculo de ventanas de tensión MPPT y trazado del gemelo digital de cableado DC/AC.
5. **📄 5. ENTREGA:** Balance financiero (CAPEX/OPEX, VAN, TIR, Payback) y exportación de propuesta técnico-comercial en PDF.

---

## 📁 Estructura del Proyecto

```
c:/TRABAJOS/RA/
├── index.html                   # Shell principal de la aplicación y visor 3D
├── AGENTS.md                    # Fuente canónica de la verdad v3.0 para desarrollo e IA
├── README.md                    # Documentación ejecutiva del repositorio
├── MANUAL_TECNICO_INGENIERIA_RA.md # Manual técnico y formulación matemática
├── MANUAL_CIENTIFICO_TECNICO_EOLICO_HIBRIDO.md # Manual científico eólico y normativo
├── ESPECIFICACION_ARQUITECTURA_MODULO_EOLICO.md # Arquitectura técnica AAA eólica
├── css/
│   └── styles.css               # Sistema de diseño, temas glassmórficos y componentes UI
├── doc/                         # Especificaciones, tecnología, arquitectura y convenciones
│   ├── 01-especificaciones.md
│   ├── 02-tecnologia.md
│   ├── 03-arquitectura.md
│   ├── 04-convenciones.md
│   └── README.md
└── js/                          # Arquitectura modular de cálculo y renderizado
    ├── config.js                # Constantes normativas y paletas de color
    ├── viewer.js                # Configuración de CesiumJS, cámara y skybox
    ├── workflow-orchestrator.js # Máquina de estados (FSM) y guards del flujo de 5 pasos
    ├── working-plane.js         # Planos 3D, tríada CAD, gizmos y empaquetamiento
    ├── buildings.js             # Huellas perimetrales y extrusión 3D de edificios
    ├── obstacles.js             # Modelado de obstáculos 3D, sombras dinámicas y UVs
    ├── solar-engine.js          # Astrofísica solar, Spencer, sombras GPU y analíticas
    ├── solar-heatmap.js         # Simulación anual no bloqueante (192 instantes) y MLPE
    ├── solar-materials.js       # Shaders fotovoltaicos y materiales PBR
    ├── electrical-engine.js     # Normativa REBT ITC-BT-40, strings MPPT y caídas de tensión
    ├── bill-auditor.js          # Auditoría de facturación y curvas horarias de consumo
    ├── financials.js            # Modelos económicos: CAPEX, OPEX, VAN, TIR y amortización
    ├── docs-generator.js        # Generación de memorias oficiales, unifilares y PDF
    ├── project-hierarchy.js     # Árbol de proyecto Scene Graph y gestión relacional
    ├── ui-outliner.js           # Panel flotante HUD del Árbol BIM del proyecto
    ├── bom-tree.js              # Estructura de desglose de materiales (BOM) y cargas
    ├── engineering-explainer.js # Diagnóstico inteligente y explicaciones técnicas
    ├── project-config.js        # Configuración del proyecto, equipos y auto-dimensionamiento
    ├── project-storage.js       # Exportación/importación .raproject y autoguardado
    ├── cable-engine.js          # Enrutado físico 3D de cableado DC/AC (RACableEngine)
    ├── equipment-ai-importer.js # Importador de fichas técnicas con IA multimodal
    ├── company-branding.js      # Identidad corporativa, logotipo y clave Gemini
    ├── measure-tool.js          # Cinta métrica 3D con snap magnético (RAMeasureTool)
    ├── capture-mode.js          # Modo captura limpia para screenshots (RACapture)
    ├── undo-manager.js          # Deshacer/rehacer universal (RAundo)
    ├── ui-viewport-controls.js  # Alertas toast, carga y controles de visualización 3D
    ├── wind-turbine.js          # Aerogeneradores 3D paramétricos (RAWindTurbine)
    ├── cesium-safety.js         # Red de seguridad anti-crash sobre Cesium
    ├── geometry-validate.js     # Validación de polígonos simples
    └── error-handler.js         # Gestor central de errores de runtime
```

---

## ⌨️ Atajos de Teclado Principales

| Tecla | Acción | Contexto |
| :---: | :--- | :--- |
| `M` | Alternar la cinta métrica 3D (medición física 3D, 2D y desnivel) | Global |
| `S` | Conmutar el snap magnético de la cinta métrica (con `M` activa) | Cinta métrica |
| `T` | Alternar textura PBR fotorrealista en módulos FV | Paso 2 / 3 |
| `L` / `H` | Alternar etiquetas 3D / visibilidad de paneles | Global |
| `C` | Alternar modo captura limpia (screenshots) | Global |
| `Escape` | Cancelar herramienta activa o deseleccionar elemento | Global |
| `Supr / Del` | Eliminar elemento seleccionado (vértice, obstáculo, módulo) | Selección activa |
| `Ctrl + Z` | Deshacer universal | Global |
| `Ctrl + Shift + Z` / `Ctrl + Y` | Rehacer | Global |

---

## ⚖️ Normativa Técnica Aplicada

- **REBT (RD 842/2002) ITC-BT-40:** Instalaciones generadoras de baja tensión y límites de caída de tensión ($\le 1.5\%$).
- **UNE-EN / IEC 62548:** Diseño de matrices fotovoltaicas y comprobación de límites de tensión en circuito abierto ($V_{oc}$ a $-10^\circ\text{C}$).
- **CTE DB-HE5:** Rendimientos mínimos y dimensionado de generación solar.
- **UNE-EN 62305:** Protección contra el rayo y trazado leapfrog con reducción de bucles inductivos.