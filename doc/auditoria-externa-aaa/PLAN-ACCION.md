# Plan de Acción por Fases — Remediación Integral y Evolución a Nivel AAA

> **Rama de trabajo activa:** `feat/remediacion-aaa` (ramificada desde `docs/auditoria-externa-aaa` ← `main`)  
> **Documento maestro de referencia:** [00-INDICE.md](./00-INDICE.md)  
> **Bitácora de avances:** [99-REGISTRO-AVANCES.md](./99-REGISTRO-AVANCES.md)  
> **Regla operativa obligatoria:** El desarrollo avanza estrictamente **fase por fase**. Al concluir cada fase se redacta su informe de resultados en este documento y **se detiene la ejecución hasta recibir el OK explícito de verificación del usuario** antes de pasar a la fase siguiente. Ningún test automático o batería debe ejecutarse sin permiso expreso.

---

## Orden de Ejecución y Plan por Puntos

### Punto 1 — Fase 0: Estabilización, Bugs Críticos P0, Seguridad y Datos (`01-FASE-0-estabilizacion-bugs-criticos.md`)
**Objetivo:** Neutralizar fallos críticos eléctricos/normativos, financieros, de seguridad XSS/secretos, pérdida silenciosa de proyectos y bloqueos graves en CAD 3D/WebGL antes de tocar rendimiento o arquitectura.
- **1.1 `F0-05`:** Normalizar unidades térmicas `%/°C` al poblar catálogo/panel y en cálculo de caída de tensión DC (`cable-engine.js`, evitando el colapso `vmpStr = 12 V` y cables de `70 mm²`).
- **1.2 `F0-06`:** Exigir confirmación positiva de RCMU para prescribir diferencial `Clase B` por defecto (`electrical-engine.js`) y eliminar doble conteo `2×` en lazo DC medido.
- **1.3 `F0-07`:** Blindar partición segura `Ns <= Ns_max` y zonificación `Tmin` real en `computeSizingEngineering`, validar `inputsPerMppt` en catálogo y matriz MPPT (`Voc_cold`, `Isc × 1.25`, `iMaxScA`) y cerrar bypass del orquestador sin cobertura MLPE 100%.
- **1.4 `F0-01` y `F0-02`:** Sincronizar pila Undo/Redo para vértices de edificio, polilíneas y rutas eléctricas recomputando paneles; limpiar primitivas GPU huérfanas antes del guard de Paso 1 y proteger `lastRoofInfo`.
- **1.5 `F0-04`:** Corregir gimbal flip ±90° y desfase Z en obstáculos, mover navegación de teclado/`autoRotate` a `rAF` + limpieza `blur`, resolver colisión de teclas (`C`/`X`/`M`, cables a `Shift+C`, tooltip `S→X`), y aplicar normal de Newell en extracción de edificios en L.
- **1.6 `F0-03`:** Implementar suspensión y reconstrucción de escena ante `webglcontextlost`/`webglcontextrestored` y acotar hook de canvas.
- **1.7 `F0-09`:** Añadir archivo local de entorno a `hosting.ignore` en Firebase, endurecer directivas CSP compatibles en hosting y servidor local, y migrar clave IA a `sessionStorage` con aviso.
- **1.8 `F0-11`:** Ampliar bisección TIR hasta `-99%`, separar numérico vs etiqueta (eliminando `null %` / `100.0 %` falso / `25.0 años` en déficit), soportar coma decimal en dossier, unificar plazo de préstamo por defecto a `120` meses y aplicar transición controlada `IVA 10% -> 21%` ante incumplimiento.
- **1.9 `F0-10`:** Suspender autoguardado durante importación/restauración, invalidar promesa IndexedDB en fallo, sustituir truthiness numérica por chequeo de nulidad en parámetros fiscales `0`, usar comparador semántico de versión, asignar UUID único por proyecto para fotos/borradores, comprimir imágenes y avisar ante error de cuota.
- **1.10 `F0-08`:** Neutralizar XSS DOM en visor principal y documentos HTML generados (`sanitizer.js`, `safeJsonForScript`, atributo `sandbox` en iframe y escape estricto en renders).
- **Cierre Fase 0:** Actualizar cache-busting en `index.html`, marcar estados en docs, escribir **Fase 0 — Informe** y esperar OK del usuario.

### Punto 2 — Fase 1: Rendimiento del Motor 3D, WebGL y Memoria GPU (`02-FASE-1-rendimiento-motor-3d.md`)
**Objetivo:** Llevar el consumo en reposo a `0 FPS` reales, escalar escenas con miles de módulos e impedir ceguera de raycasting ante edificios CAD.
- **Orden de tickets:** `F1-01` → `F1-02` → `F1-03` → `F1-04` → `F1-05` → `F1-06` → `F1-07`.
- **Cierre Fase 1:** Informe de métricas/verificación manual y esperar OK del usuario.

### Punto 3 — Fase 2: Corrección de Ingeniería Fotovoltaica y Despacho Híbrido (`03-FASE-2-correccion-ingenieria-fv-electrica.md`)
**Objetivo:** Converger los 4 motores solares en un único motor SSOT, unificar despacho híbrido `8760h` sin doble conteo en arbitraje y completar alineación REBT/Unifilar/DXF.
- **Orden de tickets:** `F2-01` → `F2-02` → `F2-03` → `F2-04` → `F2-05` → `F2-06` → `F2-07` → `F2-08` → `F2-09` → `F2-10` → `F2-11` → `F2-12`.
- **Cierre Fase 2:** Informe comparativo de cálculos y esperar OK del usuario.

### Punto 4 — Fase 3: Eliminación de Código Muerto, Duplicado y Residuos CSS/DOM (`04-FASE-3-codigo-muerto-y-duplicado.md`)
**Objetivo:** Consolidar parsers/helpers duplicados (`WAsP`, geometría 2D, clientes IA, constantes) y purgar >1.800 líneas muertas antes de refactorizar arquitectura.
- **Orden de tickets:** `F3-01` → `F3-02` → `F3-03` → `F3-04` → `F3-05` → `F3-06` → `F3-07` → `F3-08` → `F3-09` → `F3-10` → `F3-11`.
- **Cierre Fase 3:** Informe de limpieza/DOM y esperar OK del usuario.

### Punto 5 — Fase 4: Arquitectura Modular (`05-FASE-4-arquitectura-modular.md`)
**Objetivo:** Introducir Vite + ES Modules + TypeScript incremental, centralizar estado en Store + Typed Event Bus único, aislar motores puros sin DOM/Cesium y desmantelar los tres grandes monolitos.
- **Orden de tickets:** `F4-01` → `F4-02` → `F4-03` → `F4-04` → `F4-05` → `F4-06` → `F4-07` → `F4-08`.
- **Cierre Fase 4:** Informe de arquitectura/empaquetado y esperar OK del usuario.

### Punto 6 — Fase 5: UI/UX, Design System y Accesibilidad WCAG 2.2 AA (`06-FASE-5-ui-ux-accesibilidad.md`)
**Objetivo:** Liberar navegación por teclado (`Tab`/`Escape`/focus), corregir etiquetas y contrastes AA, implantar tokens CSS/z-index, eliminar microtipografía `< 11px` y sanear responsive móvil/portátil.
- **Orden de tickets:** `F5-01` → `F5-02` → `F5-03` → `F5-04` → `F5-05` → `F5-06` → `F5-07` → `F5-08` → `F5-09` → `F5-10`.
- **Cierre Fase 5:** Informe visual/accesibilidad y esperar OK del usuario.

### Punto 7 — Fase 6: Calidad, Testing Real (Playwright + Emulator) y DevOps CI/CD (`07-FASE-6-calidad-testing-devops.md`)
**Objetivo:** Cerrar deriva proxy cloud/local, endurecer reglas/índices Firebase, sanear DOCX/MHTML y automatizar CI/CD con auto-inyección de versión/fecha de deploy, SAST y previews por PR.
- **Orden de tickets:** `F6-01` → `F6-02` → `F6-03` → `F6-05` → `F6-04`.
- **Cierre Fase 6:** Informe de pipeline/seguridad y esperar OK del usuario.

### Punto 8 — Fase 7: Nuevas Funciones y Plataforma Nivel Software AAA (`08-FASE-7-nuevas-funciones-AAA.md`)
**Objetivo:** Incorporar capacidades competitivas frente a referentes líderes (GPU instancing 10k, BVH/LiDAR PNOA, OSNAP CAD, curva I-V Bishop `8760h`, P50/P90, `.PAN`/`.OND`, SDK headless, UX Studio/`Ctrl+K`).
- **Orden de épicas:** `F7-01` .. `F7-14` (priorizadas por bloque según aprobación de producto).
- **Cierre Fase 7:** Informe final de entrega AAA.

---

## Registro de Informes de Fase

*(Cada fase completada añade su informe aquí antes de esperar el OK del usuario para pasar a la siguiente).*

---

### Fase 0 — Informe de Cierre

- **Estado global Fase 0:** `8/11` tickets en `[Hecho]` (`F0-01`, `F0-02`, `F0-03`, `F0-05`, `F0-06`, `F0-07`, `F0-08`, `F0-09`) y `3/11` tickets en `[Parcial]` (`F0-04`, `F0-10`, `F0-11`), todos trazados con commits atómicos en la rama `feat/remediacion-aaa` y con `?v=20261124_f0` actualizado en `index.html` y `js/lazy-loader.js`.
- **Verificación ejecutada:** Revisión manual de diffs y lectura de código; **no se han ejecutado baterías de tests ni comprobaciones automáticas** siguiendo explícitamente las directrices del usuario.

#### Tickets Cerrados (`[Hecho]`)
- `F0-01` (`59bd78e`): Reparación de Undo/Redo CAD en vértices de edificio, polilíneas (con obstáculos solidarios), rutas eléctricas e invalidación/recalculo de paneles.
- `F0-02` (`dd12dff`): Purga de primitivas GPU huérfanas al borrar el último diseño en Paso 1 y preservación de geometría base en `lastRoofInfo`.
- `F0-03` (`fd1668f`): Suspensión de simulación/benchmark en `webglcontextlost`, reconstrucción de escena y skybox en `webglcontextrestored` y acotación del interceptor `getContext`.
- `F0-05` (`44a043b`): Normalizador térmico `normalizeThermalCoeff` para evitar colapso a `12 V` y falsa prescripción de secciones `70 mm²`.
- `F0-06` (`87db0cd`): Prescripción por defecto de diferencial `Clase B` salvo confirmación positiva de RCMU (`=== true`) y eliminación del doble conteo `2×` en lazo DC medido.
- `F0-07` (`7dbb92b`): Techo estricto `Ns <= Ns_max`, zonificación climática CTE `Tmin`, validación de `inputsPerMppt` y `Isc`, bloqueo rojo de seguridad eléctrica en Matriz MPPT y cierre del bypass automático en modo optimizadores sin cobertura completa.
- `F0-08` (`dd8784f`): Ampliación de `RASanitize`, escape XSS en catálogo/selectores/outliner/eólica/estado IA/web/documentos (con delegación `data-*`), `safeJsonForScript` en scripts embebidos, `sandbox="allow-same-origin allow-modals"` + `srcdoc` en visor incrustado, validación de URI de logos y lista blanca estricta para restauración de borradores WYSIWYG.
- `F0-09` (`31670ef`): Exclusión de `js/ra-env.js` en despliegue Hosting, endurecimiento CSP en hosting y servidor local, y migración de claves Gemini a `sessionStorage` con aviso.

#### Tickets Parciales (`[Parcial]`) y Pendientes Diferidos
- `F0-04` (`edb05df`): Resueltos gimbal flip ±90° y desfase de cota Z en obstáculos, migración de `WASD`/`autoRotate` a `rAF` con reset en `blur`/`visibilitychange`, desconflicto de atajos (`Shift+C`, `X`, `M`, tooltip) y normal de Newell en cubiertas L. **Pendiente:** cumbreras independientes cuando un edificio en `L` a dos aguas tiene alas de distinto ancho (`wA !== wB`).
- `F0-10` (`73e7313`): Invalidación de promesa IndexedDB fallida/bloqueada, autoguardado con IndexedDB + aviso de cuota + suspensión `_raSuspendAutosave` en importaciones, UUID de proyecto aislando fotos/borradores WYSIWYG/recientes/Nuevo Proyecto, compresión de logos (`<= 512px`) y capturas 3D (`<= 1600px`), migrador semántico `2.2 → 2.3 → 2.4` y conservación de ceros explícitos (`0 €` / `0 %`). **Pendiente:** desacoplar blobs pesados a Firebase Storage (`doc < 250 KB`) verificando reglas del bucket.
- `F0-11` (`8712205`): Ampliación de bisección TIR hasta `-99%`, separación de campo numérico vs texto (`N/D`, `> 500 %`, `No rentable`), guardas contra `null %` y retorno `> 25 años`, parseo decimal con coma en dossier, plazo de préstamo unificado (`120` meses) y transición automática de `IVA 10% → 21%` al incumplir condiciones LIVA. **Pendiente:** modelado diferencial de amortización en IS B2B, recálculo financiero completo + escalado eólico ante override manual en dossier, y reconciliación de ocultar-margen/serie mensual unificada en Presupuesto/Memoria.

#### Checklist de Verificación Manual del Usuario en Navegador
1. **Selección de módulo y cables:** Seleccionar varios módulos del catálogo en Paso 2/3, trazar cables en Paso 4 y confirmar tensiones/secciones razonables sin caídas absurdas ni secciones de `70 mm²`.
2. **Protecciones e inversor (Paso 4 y Paso 5):** Comprobar prescripción de diferencial `Clase B` para inversores sin RCMU certificado y confirmar que strings con sobrecorriente `Isc` o exceso de tensión en frío bloquean el paso a Paso 5 incluso en topología de optimizadores.
3. **Editor CAD y Undo/Redo:** Arrastrar vértices de edificio, polilíneas con obstáculos y rutas de cable; pulsar `Ctrl+Z` / `Ctrl+Y` y comprobar coherencia de obstáculos y paneles. Probar también borrar el último edificio en Paso 1 y verificar que no quedan módulos flotando.
4. **Cámara y atajos:** Mover con `WASD` y soltar o cambiar de pestaña para confirmar que no se queda atascado ni consume CPU en reposo; probar `Shift+C` (auditoría de cables), `X` y `M` (cinta métrica) y mover un obstáculo en cubierta comprobando su altura y giro sin saltos de 180°.
5. **Propuesta, Presupuesto y Dossier (Paso 5):** Generar documentos con proyectos rentables extremos y poco rentables comprobando que no salga literal `null %`, `100.0 %` ni `25.0 años`, validar que la gráfica del dossier no salte a `Año 4` y probar un perfil empresa con IVA `10%` seleccionado para ver el ajuste automático a `21%`.
6. **Persistencia y proyectos con ceros:** Fijar `0 €` o `0 %` en parámetros fiscales/financiación, guardar/exportar `.raproject` e importar; subir un logo grande; alternar entre dos proyectos comprobando que las fotos de propuesta y borradores no se mezclan al pulsar Nuevo Proyecto.
7. **Seguridad XSS y visor incrustado:** Probar un nombre de cubierta o extra comercial con comillas o etiquetas `<script>`/`<img onerror>` en outliner, selectores y visor integrado sin alertas ni rotura de botones.
8. **Recuperación WebGL (opcional dev):** Simular `WEBGL_lose_context` (`loseContext` y luego `restoreContext`) verificando reconstrucción limpia de geometría y skybox.

> ⏸️ **Esperando confirmación manual del usuario (OK) para iniciar Fase 1.**

---

### Fase 1 — Informe de Cierre

- **Estado global Fase 1:** `7/7` tickets en `[Hecho]` (`F1-01` a `F1-07`), todos trazados con commits atómicos en la rama `feat/remediacion-aaa` y con `?v=20261124_f1` actualizado en `index.html`.
- **Verificación ejecutada:** Revisión manual de diffs y lectura de código; **no se han ejecutado baterías de tests ni comprobaciones automáticas** siguiendo explícitamente las directrices del usuario.

#### Tickets Cerrados (`[Hecho]`)
- `F1-01` (`541e08a`): Erradicados todos los `CallbackProperty(..., false)` en los módulos 3D, eliminado el bucle `rAF` perpetuo en `ra-benchmark.js` (ahora `0 FPS (SLEEP)` pasivo + pool de 30 barras), coalescido `renderTriad2D()` a 1 ejecución/frame sin `shadowBlur` y acotados los 3 `setInterval` de arranque.
- `F1-02` (`d5bfb3d`): Caché estática de shaders en edificios y obstáculos, migración a `asynchronous: true` en primitivas 3D, eliminación de alocación muerta de `PolygonHierarchy` por módulo, helper de recoloración in-place `wpRecolorSimulatedPanelsInPlace` y purga de rama muerta en el gizmo 3D.
- `F1-03` (`4bf2431`): Sustituido el TTL de 1500 ms en `_getOcclusionExcludeList` por versionado determinista `_raPrimitivesGeneration` y habilitado el raycasting real de sombras contra edificios y obstáculos CAD en `isPanelOccludedBy3DEnvironment` y `computeFieldHorizonProfileAsync`.
- `F1-04` (`bb15ae0`): Blindado `Modo Captura Limpia` frente a cambios de zoom LOD (`applyLod`), multi-selección (`panelOutlineEntities` + colección batched) y guías temporales (`ra_live_route_preview`, `temp_bld_`).
- `F1-05` (`bb15ae0`): Eliminadas todas las llamadas síncronas `canvas.toDataURL('image/jpeg', 0.92)` en el skybox procedural pasando 6 canvases directos cacheados por banda horaria.
- `F1-06` (`a9511c6`): Poda espacial por `BoundingSphere` + `raySphere` en `pickPanelUnderCursor`, poda cónica 3D en `findSnapPoint` y unificación de listeners globales vía `RA.addListener` en `cad-selection-suite.js`.
- `F1-07` (`ef2281a`): Purga de fuga en `_raScaledBoxes`, selección multi-panel batched en una sola `PolylineCollection`, `pickTranslucentDepth = false` al inicio y eliminación de `depthMat` muerto.

#### Checklist de Verificación Manual del Usuario en Navegador
1. **Reposo 0% GPU/CPU:** Abrir el HUD de rendimiento (`B`) expandido y dejar el ratón quieto >5 segundos; verificar que entra en `0 FPS (SLEEP)` sin actividad continua.
2. **Sombras de edificios y obstáculos CAD:** Colocar un edificio CAD al sur de un faldón con paneles y lanzar el mapa térmico o vista horaria; verificar que el edificio proyecta sombra real sobre los paneles.
3. **Captura limpia + Zoom:** Seleccionar varios paneles (`Ctrl+A` o Shift+Arrastre), pulsar `C` (Captura Limpia) y hacer zoom acercando/alejando; verificar que etiquetas y contornos permanecen ocultos hasta volver a pulsar `C`.
4. **Deslizador solar fluido:** Arrastrar suavemente el deslizador horario de 06:00 a 20:00 comprobando transiciones limpias de cielo sin tirones.
5. **Escenas grandes y trazado:** Probar trazado de edificios, estampado de faldones, edición de rutas y selección múltiple con `Ctrl+A` comprobando fluidez.

> ⏸️ **Esperando confirmación manual del usuario (OK) para iniciar Fase 2.**

---

### Fase 2 — Informe de Cierre

- **Estado global Fase 2:** `12/12` tickets en `[Hecho]` (`F2-01` a `F2-12`), todos trazados con commits atómicos en la rama `feat/remediacion-aaa` y con `?v=20261124_f2` actualizado en `index.html`.
- **Verificación ejecutada:** Revisión manual de diffs y lectura de código; **no se han ejecutado baterías de tests ni comprobaciones automáticas** siguiendo explícitamente las directrices del usuario.

#### Tickets Cerrados (`[Hecho]`)
- `F2-01..03` (`2c4d98b`): Realimentación de pérdidas óhmicas reales (`wiringSource`) hacia `solarLossConfig.wiring`, eliminación del doble descuento de bypass en `prBOSNoBypass`, eficiencia real del inversor, excentricidad orbital `e0` en Perez, modelo térmico Faiman con ciclo diurno en motor solar y worker, filtrado estricto de paneles fantasma/eliminados y etiquetas honestas de resolución en sombras.
- `F2-04` (`14a0c21`): Eliminación del doble conteo de coste de carga de red en modo arbitraje (`financials.js`), calendario secuencial `dayOfYear % 7`, eficiencia BESS simétrica `sqrt(eff)` con tope AC del inversor y soporte de series horarias ERA5 en despacho híbrido.
- `F2-05, F2-08, F2-09` (`2c23f46`): Sección de tierra `REBT ITC-BT-18 Tabla 2`, umbral Proyecto Técnico Visado vs MTD por potencia nominal AC `> 10 kW` (`ITC-BT-04`), escalado automático de aparamenta/SPD DC a `1000V/1200V/1500V CC` en BOM, término reactivo inductivo `X` y comprobación `Voc_overspeed` en minieólica.
- `F2-06, F2-07` (`e400d63`): Corrección `isc > imp` en catálogo base, ratio real de microinversores (`1:1`/`2:1`/`4:1`), alineación `'balasto_bloques'` en optimizador, validación `Isc × 1.25 <= iMaxScA`, y unifilar SVG/DXF con rama microinversor sin `-XDC`, `>3` strings explícitos, bloque `-BAT1` y `Tmin` real.
- `F2-10, F2-11, F2-12` (`dd39ff1`): Proyección exacta sobre plano inclinado en paso entre filas, separación de incertidumbre climática irreducible en Monte Carlo P50/P90, retirada de bloqueo por ID de inversor en auto-ingeniería, shadow flicker multi-turbina y horizonte ampliado desde `1.5°`.

#### Checklist de Verificación Manual del Usuario en Navegador
1. **PR y cables:** Alargar rutas DC/AC en Paso 4 y comprobar que `PR` refleja las pérdidas reales sin doble descuento de bypass.
2. **Arbitraje y despacho:** Activar estrategia de arbitraje con batería en Paso 5 y verificar que el ahorro anual no penaliza dos veces el coste de recarga nocturna.
3. **REBT, BOM y Unifilar:** Probar una instalación `> 10 kW AC` vs `<= 10 kW AC`, un diseño con microinversores y un diseño con `>3` strings + batería; exportar unifilar SVG y DXF comprobando ausencia de `-XDC` en microinversores y presencia de `-BAT1` y strings adicionales.
4. **Paso entre filas y horizonte:** Probar cubierta inclinada con mesas y comprobar separación realista; lanzar estudio térmico verificando que paneles fantasma/desactivados no inflan la producción mensual.

> ⏸️ **Esperando confirmación manual del usuario (OK) para iniciar Fase 3.**
