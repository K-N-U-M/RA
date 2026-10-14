# 02. Tecnología Empleada

> **VERSIÓN CANÓNICA v3.0** — Flujo de trabajo de **5 pasos**. Ver `AGENTS.md`.

## 1. Stack principal

| Capa | Tecnología | Notas |
| :--- | :--- | :--- |
| **Entrada** | Navegador moderno (Chromium recomendado) | Web app cliente, sin instalación. |
| **Lenguaje base** | HTML5 + CSS3 + JavaScript (Vanilla, ES6+) | `index.html` monolítico (~1 MB). Sin framework de UI. |
| **3D Geoespecial** | CesiumJS (WebGL) | Globos, tiles fotorrealistas, DTM/OSM, primitivas, `ScreenSpaceEventHandler`, sombras GPU. Es el **único motor 3D**; no hay capa Three.js. |
| **Cálculo matemático** | JavaScript (Vanilla, en módulos `js/`) | Vectores, geometría 2D/3D, sombras y física solar viven en los motores `js/*.js` y en el bloque inline de `index.html`. No existe capa `src/*.ts`. |
| **Persistencia** | `localStorage` | Catálogo (`ra_equipment_catalog`), proyecto y configuraciones. |
| **PDF/Informes** | Generación en cliente | `js/docs-generator.js`. |
| **Datos geográficos** | Google Photorealistic 3D Tiles | Fuente base del terreno/edificios de contexto. |

> ⚠️ **Sin build system ni gestor de paquetes.** No existe `package.json`, `tsconfig.json` ni bundler. Los scripts en `js/` se cargan como `<script>` clásico en orden. **No existen ni `src/*.ts` ni Three.js**: toda la matemática es JavaScript dentro de `js/` y del bloque inline de `index.html`.

## 2. Módulos JavaScript (`js/`)

| Archivo | Responsabilidad |
| :--- | :--- |
| `config.js` | Constantes, paletas de color y configuración global inicial. |
| `viewer.js` | Configuración del visor CesiumJS, cámara, skybox procedural y rendering loop. |
| `workflow-orchestrator.js` | Máquina de estados (FSM) y orquestación del flujo canónico de 5 pasos con guards. |
| `working-plane.js` | Planos de trabajo 3D, faldones, tríada CAD, gizmos y empaquetamiento booleano. |
| `buildings.js` | Edificios 3D: huella perimetral, extrusión volumétrica y tipologías de tejado. |
| `obstacles.js` | Obstáculos (chimeneas, casetones, árboles), sombras y coordenadas UV. |
| `solar-engine.js` | Astrofísica solar, algoritmo de Spencer, sombras GPU y analíticas. |
| `solar-heatmap.js` | Simulación anual no bloqueante (192 instantes), heatmap y diagnóstico MLPE. |
| `solar-materials.js` | Materiales PBR y shaders fotovoltaicos. |
| `electrical-engine.js` | Cálculo eléctrico, casación de inversores, strings MPPT y cableado REBT ITC-BT-40. |
| `bill-auditor.js` | Auditoría de facturas eléctricas y contraste de consumo real. |
| `financials.js` | Balances económicos, CAPEX/OPEX, VAN/TIR y periodo de amortización. |
| `docs-generator.js` | Generador de propuestas comerciales, memoria técnica oficial, esquemas unifilares y PDF. |
| `project-hierarchy.js` | Modelo de datos jerárquico Scene Graph (Planos → Faldones → Módulos → Obstáculos). |
| `ui-outliner.js` | Árbol de proyecto flotante interactivo (BIM Outliner). |
| `bom-tree.js` | Desglose estructurado de materiales (BOM) y cargas estructurales. |
| `engineering-explainer.js` | Diagnóstico interactivo y resúmenes ejecutivos para cliente. |
| `project-config.js` | Estado de configuración del proyecto, equipos seleccionados y auto-dimensionamiento. |
| `project-storage.js` | Exportación/importación de proyectos `.raproject` y autoguardado. |
| `cable-engine.js` | Motor de enrutado físico 3D de cableado DC/AC (`RACableEngine`). |
| `equipment-ai-importer.js` | Importador de fichas técnicas (datasheets) con IA multimodal. |
| `company-branding.js` | Identidad corporativa, logotipo y clave Gemini (`RACompanyBranding`). |
| `measure-tool.js` | Cinta métrica 3D con desglose físico y snap magnético (`RAMeasureTool`). |
| `capture-mode.js` | Modo captura limpia de escena para screenshots (`RACapture`). |
| `undo-manager.js` | Deshacer/rehacer universal transaccional (`RAundo`). |
| `ui-viewport-controls.js` | Alertas toast, pantalla de carga y controles de visualización 3D. |
| `wind-turbine.js` | Aerogeneradores 3D paramétricos HAWT/VAWT (`RAWindTurbine`). |
| `cesium-safety.js` | Red de seguridad anti-crash sobre primitivas Cesium. |
| `geometry-validate.js` | Validación de polígonos simples (sin auto-intersección). |
| `error-handler.js` | Gestor central de errores de runtime (`RA_ErrorHandler`). |

## 3. Herramientas de desarrollo y verificación

| Herramienta | Uso |
| :--- | :--- |
| Node.js (v18+) | Scripts de verificación en `tests/`, validación sintáctica. |
| `tests/test-js-syntax.js` | Extrae cada `<script>` de `index.html` y valida su sintaxis con `new Function`. |
| `tests/test-ra-full-workflow.js` | Suite de verificación (carga de módulos, sombras, cálculo eléctrico). |
| `tests/test-equipment-ai-importer.js` | Pruebas del importador IA de fichas técnicas. |
| `tests/test-cable-engine.html` | Suite manual del motor de cableado (`RACableEngine.runSelfTests()`). |
| PowerShell 7 (`pwsh`) | Shell de referencia en el entorno de desarrollo (Windows). |

## 4. Cargas de script (orden de `<script>` en `index.html`)

1. Librerías CDN: **CesiumJS** (único motor 3D).
2. Módulos `js/*.js` (config → viewer → motores → workflow).
3. `<script>` inline principal (estado global, UI, eventos, estado `universalGizmoState`, `renderUniversalGizmo2D`, `getUniversalSelectedTarget`, etc.).

> Las funciones de `index.html` invocadas por atributos HTML (`onclick`, `onchange`) y las referenciadas desde `js/*.js` deben estar **expuestas en `window`** (ver `doc/04-convenciones.md`).