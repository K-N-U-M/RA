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
