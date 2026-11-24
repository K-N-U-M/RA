# FASE 7 — Roadmap de Nuevas Funciones y Arquitectura Nivel Software AAA

> **Objetivo de la fase:** Elevar la aplicación más allá de corregir bugs: igualar y superar a referentes comerciales líderes (PVsyst, Aurora Solar, HelioScope, OpenSolar, Figma CAD) en precisión física 3D, ingeniería eléctrica automatizada, UX profesional, plataforma SDK/B2B y calidad industrial.
> **Prerrequisitos:** Completar al menos **Fase 0** (estabilidad/P0), **Fase 1** (`F1-01..F1-03` rendimiento/oclusión), **Fase 2** (SSOT solar y eléctrico) y la base modular de **Fase 4** (`Vite + ESM + Store + Pure Engines`).
> **Protocolo para IAs:** Consulta [00-INDICE.md](./00-INDICE.md) y documenta cada entregable en [99-REGISTRO-AVANCES.md](./99-REGISTRO-AVANCES.md).

---

## Tabla de Capacidades AAA — Fase 7

| ID | Dominio | Título de la Funcionalidad AAA | Esfuerzo | Dependencias | Origen | Estado |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- |
| **F7-01** | CAD 3D / WebGL | Instanciación real GPU (`InstanceMatrix` + `PerInstanceAttribute` Pool) para >10.000 paneles a 60–120 FPS | L | F1-02 | AAA A-1 | `[Pendiente]` |
| **F7-02** | CAD 3D / WebGL | Índice espacial híbrido (`BVH + Quadtree ENU`) y raytracer solar offline/Worker sobre malla CAD + DSM | XL | F1-03, F1-06 | AAA A-2 + A-3 | `[Pendiente]` |
| **F7-03** | CAD 3D / WebGL | Suite CAD OSNAP completa (Fin, Medio, Intersección, Perpendicular, Paralelo, Polar) + entrada numérica `Tab` | L | F1-06, F0-04 | AAA A-4 | `[Pendiente]` |
| **F7-04** | CAD 3D / WebGL | Gizmo 3D GPU viewport-space con planos coplanares UV/UN/VN + Planos de Sección y Clash Detection 3D | L | F1-02 | AAA A-5 + A-6 | `[Pendiente]` |
| **F7-05** | Ingeniería FV | Motor horario `8760h` TMY/PVGIS acoplado a curva I-V Bishop de 3 sub-strings y MPPT multi-pico global | XL | F2-02, F4-06 | AAA B-1 | `[Pendiente]` |
| **F7-06** | Ingeniería FV | Auto-stringing inteligente (MILP/clúster) consciente de sombras 3D, `inputsPerMppt` y desequilibrio de fases | L | F2-03, F0-07 | AAA B-2 | `[Pendiente]` |
| **F7-07** | Ingeniería FV | Import/Export nativo `.PAN`/`.OND` (PVsyst) + DXF IEC 60617 vectorial completo e implantación 2D acotada | L | F2-06 | AAA B-3 | `[Pendiente]` |
| **F7-08** | Ingeniería FV/Fin | Análisis estocástico bancable P50/P75/P90/P99 (25 años con LID/degradación -> VAN/TIR/DSCR P90) | M | F2-11, F0-11 | AAA B-4 | `[Pendiente]` |
| **F7-09** | Ingeniería FV/3D | Ingesta automática LiDAR/DSM PNOA-IGN `0.5 m` + Google Solar DSM y detección semiautomática de cubiertas/obstáculos | XL | F7-02 | AAA B-5 | `[Pendiente]` |
| **F7-10** | Híbrido / Tarifas | Gemelo único `8760h` FV + ERA5 Eólica + BESS con CSV cuartohorario Datadis y optimización de potencias P1..P6 | L | F2-04 | AAA B-6 | `[Pendiente]` |
| **F7-11** | Arquitectura / B2B | Headless Calculation SDK (`@ra/sdk` Node/Edge), API de Plugins normativos multi-país y Comparador paralelo multi-variante | XL | F4-06, F4-07 | AAA C-1 + C-2 + C-3 | `[Pendiente]` |
| **F7-12** | Colaboración / Obs | Sincronización multi-pestaña/colaborativa (CRDT/Firestore deltas), historial de instantáneas y Time-Travel Debugging | XL | F4-03, F4-04 | AAA C-4 + C-5 + F-4 | `[Pendiente]` |
| **F7-13** | UI/UX AAA | Command Palette (`Ctrl+K`), Split-View 3D + Drawer Inferior (Matriz MPPT/Unifilar), Modo Dual (Comercial/Experto) y Preview live en Studio | XL | F5-07..F5-10 | AAA E-1..E-7 | `[Pendiente]` |
| **F7-14** | Seguridad / QA / Tooling | BFF Cloud Functions v2 (App Check + cero API keys en cliente), Playwright E2E WebGL + SAST (`ESLint`/`Stylelint`/`jscpd`/`knip`) | L | F6-01..F6-05 | AAA D-1..D-4 + F-2..F-6 | `[Pendiente]` |

---

## Especificación Detallada de Épicas AAA

### `F7-01` — Instanciación real GPU (`InstanceMatrix` + `PerInstanceAttribute` Pool)
- **Brecha actual:** Hoy se recrean geometrías y vértices completos al cambiar de modo visual (`Heatmap`/`String`/`Normal`).
- **Especificación:** Reutilizar una malla unitaria por tipo de módulo (`BoxGeometry` + UV textura frontal + estructura soporte) instanciada mediante matrices `4×4` y atributos por instancia mutables en GPU (`instanceColor`, `highlightWeight`, `ghostAlpha`).
- **Criterios de aceptación:** Escena de **10.000 paneles** orbita a **>= 60 FPS** y conmuta modo visual completo en **< 2 ms**.

### `F7-02` — Índice Espacial Híbrido (`BVH + Quadtree ENU`) y Raytracer Offline/Worker
- **Brecha actual:** `pickPanelUnderCursor` y `findSnapPoint` escanean linealmente (`O(N)`), mientras `isPanelOccludedBy3DEnvironment` solo ve Google 3D Tiles cargadas en vista actual (`occlusion3D: null` enviado al worker).
- **Especificación:** Construir un BVH en espacio mundo + Quadtree 2D `(u, v)` por faldón para snapping y picking `< 1 ms`, y exportar mallas de edificios/obstáculos/cubiertas + mapa hemisférico de profundidad 360° offscreen hacia el `solar-worker` para calcular oclusiones 3D deterministas independientes de la cámara actual.
- **Criterios de aceptación:** Picking/snapping constante `< 1 ms` con 5.000+ paneles; resultados de heatmap anual idénticos sin importar zoom ni ángulo previo de cámara.

### `F7-03` — Suite CAD OSNAP Completa + Polar Tracking + Entrada Numérica Directa
- **Brecha actual:** Solo existe snap ortogonal básico en huella y vértices lineales en cinta métrica.
- **Especificación:** Añadir modos OSNAP activables (Endpoint, Midpoint, Intersection, Perpendicular, Parallel a arista de referencia), guías inteligentes polares (15°/30°/45°/90°) proyectadas sobre el plano de trabajo activo y cuadro flotante interactivo (`Tab`) para teclear longitud/ángulo exactos estilo AutoCAD/SketchUp.
- **Criterios de aceptación:** Trazar un faldón o línea escribiendo `12.5 [Tab] 90 [Enter]` genera arista exacta al milímetro dentro del plano inclinado.

### `F7-04` — Gizmo 3D en GPU Viewport-Space + Planos de Sección y Clash Detection 3D
- **Brecha actual:** Gizmo 2D dibujado con Canvas `shadowBlur` sin traslación coplanar simultánea en 2 ejes y sin detección automática de choques 3D.
- **Especificación:** Renderizar gizmo 3D real en espacio de vista (`depthTest: false`, escala constante en píxeles) con asas coplanares UV/UN/VN y arco angular numérico live; añadir `Cesium.ClippingPlaneCollection` de corte y comprobación OBB-OBB en tiempo real entre módulos elevados, petos, chimeneas y bandejas de cables.
- **Criterios de aceptación:** Arrastrar placa o pérgola cerca de peto/obstáculo muestra resaltado rojo de interferencia cuando la holgura real es `< 0 m`.

### `F7-05` — Motor Horario `8760h` + Curva I-V Bishop (3 sub-strings) + MPPT Multi-Pico
- **Brecha actual:** `4` motores solares desconectados, modelo lineal heurístico de sombras por módulo sin resolver caída conjunta de string por debajo de `V_mppt_min`.
- **Especificación:** En `solar-worker` (tras F2-02), resolver la curva I-V acoplada por string usando los 3 sub-módulos/diodos de bypass de cada placa conectada en `mppt-matrix-controller.js` y curva real de seguimiento MPPT global/local + eficiencia `η(P_dc, V_dc)` del inversor durante las 8.760 horas TMY.
- **Criterios de aceptación:** Comparativa String puro vs Optimizadores selectivos vs Microinversores muestra ganancia diferencial real validada contra escenario patrón de sombra parcial (ej. sombra progresiva de chimenea sobre 1 fila).

### `F7-06` — Auto-Stringing Inteligente Consciente de Sombras 3D
- **Brecha actual:** Particionamiento secuencial en serpiente ciego al heatmap de sombras y a `inputsPerMppt`.
- **Especificación:** Algoritmo heurístico/MILP post-heatmap que agrupa en el mismo string/MPPT paneles con perfiles horarios de irradiancia correlacionados, aislando paneles sombreados en MPPT separado o sugiriendo optimizadores selectivos únicamente en las unidades afectadas, respetando límites eléctricos (`Voc`, `Isc`, `inputsPerMppt`) y balance de fases.
- **Criterios de aceptación:** En cubierta con chimenea local, el auto-stringing propone agrupación que supera en `>= 2%` la producción anual frente al particionamiento serpiente ciego.

### `F7-07` — Import/Export `.PAN` / `.OND` (PVsyst) y CAD DXF IEC 60617 Multi-Topología
- **Brecha actual:** Catálogo sin parámetros de un diodo; DXF limitado a <=3 strings sin microinversores ni batería.
- **Especificación:** Parser de archivos `.PAN` / `.OND` para incorporar hojas técnicas exactas de fabricantes Tier-1 y generador DXF vectorial con bloques normalizados IEC 60617 completos (multi-inversor, bus AC de microinversores, híbrido + BESS + backup ATS, híbrido eólico) + plano 2D de cubierta acotado con numeración de strings y rutas de bandejas.
- **Criterios de aceptación:** Importar un `.PAN`/.OND real de fabricante puebla todos los parámetros eléctricos/térmicos; abrir el `.dxf` exportado en LibreCAD/AutoCAD muestra capas limpias para cada string, inversor y batería.

### `F7-08` — Análisis Probabilístico Bancable P50 / P75 / P90 / P99 (25 Años)
- **Brecha actual:** Monte Carlo simplificado que reduce incertidumbre artificialmente al combinar APIs.
- **Especificación:** Simulación estocástica a 25 años separando incertidumbre meteorológica interanual, modelo de transposición/soiling, LID/LeTID y degradación anual, propagando percentiles P50/P90 hacia VAN, TIR y DSCR financiero exportables en tabla bancaria de la oferta.
- **Criterios de aceptación:** Generación de tabla P50/P75/P90/P99 coherente en memoria técnica y dossier comercial con flujos de caja asociados.

### `F7-09` — Ingesta LiDAR/DSM PNOA-IGN `0.5 m` y Detección Semiautomática de Cubiertas
- **Brecha actual:** Trazado 100% manual y dependencia exclusiva de Google 3D Tiles en vista.
- **Especificación:** Cargar capas GeoTIFF DSM (PNOA España / Google Solar API), reconstruir malla local de alta precisión de la manzana (incluyendo arbolado y chimeneas), extraer automáticamente planos candidatos de faldón por RANSAC normal y proyectar contorno de tejado con 1 clic.
- **Criterios de aceptación:** Seleccionar punto sobre edificio en España carga altimetría DSM y propone planos inclinados y alturas de entorno en `< 5 s`.

### `F7-10` — Gemelo Único `8760h` + CSV Cuartohorario Datadis + Optimización de Potencias P1..P6
- **Brecha actual:** Perfiles sintéticos de consumo y demanda eólica/solar no conectados a curvas reales ni maxímetro.
- **Especificación:** Importador de curvas cuartohorarias reales (`Datadis` / distribuidoras CSV), simulación `8760h` (o `35040` pasos de 15 min) con batería virtual/arbitraje TOU/límite de vertido RD 244 y optimizador automático de potencia contratada óptima por periodo `P1..P6` considerando maxímetro real.
- **Criterios de aceptación:** Al cargar un CSV real de consumo 3.0TD de un cliente industrial, la app calcula el ahorro exacto en término de energía + término de potencia + compensación de excedentes.

### `F7-11` — Headless SDK (`@ra/sdk`), Plugin API Multi-País y Comparador Multi-Variante en Pool
- **Brecha actual:** Motores atados al DOM y comparador `wpCompararEscenarios` basado en estimaciones aproximadas.
- **Especificación:** Publicar los motores puros de Fase 4 como paquete `@ra/sdk` ejecutable en Node/Cloud Functions para cálculos masivos batch B2B; introducir contrato de plugins para normativas regionales (`REBT ES`, `RTIEBT PT`, `NF C 15-100 FR`); y lanzar 3–4 escenarios reales completos en paralelo sobre un Pool de Web Workers con vista `Diff` lado a lado.
- **Criterios de aceptación:** Ejecutar `RAEngine.evaluate(projectJson)` en CLI Node retorna tamaño eléctrico, PR, producción y cashflow en `< 200 ms` sin navegador.

### `F7-12` — Colaboración Multi-Pestaña, Historial de Versiones en Nube y Time-Travel Debugging
- **Brecha actual:** Sobreescritura monolítica en Firestore, colisiones entre pestañas y sin trazabilidad de cambios.
- **Especificación:** Sincronizar pestañas vía `BroadcastChannel`, guardar deltas/versiones nombradas en la nube (`v1 Preliminar`, `v2 Visita técnica`, `v3 Oferta final`) con `Diff` visual y permitir reproducir cualquier traza de comandos + errores desde archivo de telemetría JSON (*Time-Travel*).
- **Criterios de aceptación:** Abrir el mismo proyecto en dos pestañas refleja cambios sin corrupción y permite revertir a una instantánea histórica guardada en la nube.

### `F7-13` — UX Profesional AAA: `Ctrl+K` Command Palette, Split-View Inferior MPPT/Unifilar, Modo Dual y Preview Live
- **Brecha actual:** Sidebar angosto (`350–400px`) saturado con microtexto `< 11px` para matrices MPPT, ausencia de buscador de comandos, mezcla de controles comerciales simples e ingeniería dura, y edición ciega en `ProposalStyleStudio`.
- **Especificación:**
  1. **Command Palette (`Ctrl+K`)** unificada para acciones, equipos, cubiertas y modos de vista.
  2. **Drawer Inferior Redimensionable** sincronizado bidireccionalmente con 3D para Matriz MPPT, Unifilar interactivo y Comparador de Escenarios.
  3. **Chuleta interactiva `?`** de atajos CAD configurables.
  4. **Selector Comercial vs Experto** en cabecera (ocultando parámetros REBT/CFD avanzados en presentaciones comerciales).
  5. **Live Preview Split-Screen** en `ProposalStyleStudio` viendo cambios de portada, paleta y saltos A4 al instante.
- **Criterios de aceptación:** Matriz MPPT y Estudio de Estilos operan cómodamente con tipografía `>= 12px` sin scroll horizontal dentro de un workspace amplio.

### `F7-14` — Seguridad Defensa-en-Profundidad (BFF Cloud Functions v2, App Check, Playwright Visual 3D y Tooling CI)
- **Brecha actual:** API keys IA en cliente, proxy local/nube divergentes, `0` tests E2E y sin linters estáticos ni SAST.
- **Especificación:** Enrutar IA/OCR/proxies por Cloud Functions v2 protegidas con Firebase Auth + App Check + cuota por tenant; completar pipeline CI con ESLint (Flat Config), Stylelint, `jscpd` anti-duplicados, comprobación AST HTML↔JS↔CSS (camino a `knip`), SAST (Semgrep/CodeQL para XSS y reglas Firebase), Trusted Types y Playwright E2E con regresión visual WebGL en cada PR.
- **Criterios de aceptación:** Cero claves sensibles en navegador, 100% PRs validados con canal preview efímero + E2E WebGL + Emulador Firebase + SAST verde antes de merge a `main`.
