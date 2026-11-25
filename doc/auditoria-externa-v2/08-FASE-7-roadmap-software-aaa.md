# FASE 7 (Auditoría Externa v2) — Roadmap de Evolución a Software Calidad AAA

> **Objetivo:** Elevar RA Solar 3D al nivel de referentes comerciales líderes (PVsyst, Aurora Solar, HelioScope, SketchUp) apoyándose sobre el núcleo limpio de las Fases 0–6.  
> **Protocolo para IAs:** Ver [00-INDICE.md](./00-INDICE.md) y registrar cierre en [99-REGISTRO-AVANCES.md](./99-REGISTRO-AVANCES.md).

---

## Tabla de Épicas AAA — Fase 7

| ID | Dominio | Título de la Épica AAA | Esfuerzo | Dependencias | Estado |
| :--- | :--- | :--- | :---: | :--- | :---: |
| **V2-F7-01** | CAD 3D | Máquina de Comandos CAD + Glifos OSNAP 2D + Value Control Box estilo SketchUp y Multi-Selección | L | V2-F1-01, V2-F4-03 | `[Pendiente]` |
| **V2-F7-02** | WebGL / GPU | Instanciación real GPU (`InstanceMatrix` + unified shader PBR/Heatmap) + BVH 2 niveles (10k–50k paneles) | XL | V2-F1-03, V2-F1-04 | `[Pendiente]` |
| **V2-F7-03** | CAD / DSM | Auto-Detección de Cubiertas 3D Tiles RANSAC + Solvedor Straight-Skeleton L/U/T/H + Section Box 6 planos | XL | V2-F1-02, V2-F1-04, V2-F1-05 | `[Pendiente]` |
| **V2-F7-04** | Ingeniería FV/Eól | Núcleo Único `8760h`/`35040` Co-Simulado (TMY + Perez + Bishop + Eólica + BESS + CNMC P1..P6) | XL | V2-F2-02..06, V2-F4-03 | `[Pendiente]` |
| **V2-F7-05** | Bancabilidad/REBT | Monte Carlo P50/P75/P90/P99 Post-Impuestos B2B + REBT `I_cc`/`I²t`/ΔV Óptimo + Bifacial View-Factor 2D | L | V2-F0-05..07, V2-F2-01 | `[Pendiente]` |
| **V2-F7-06** | Interoperabilidad | Parser completo `.PAN`/`.OND` (`ProfilPIO`/IAM/1-diodo), exportación `.PVC` PVsyst y DXF IEC 60617 | L | V2-F2-05 | `[Pendiente]` |

---

### `V2-F7-01` — Máquina de Comandos CAD, Glifos Visuales OSNAP y Value Control Box
- **Especificación:** Sustituir las banderas dispersas (`WP.mode`, `appMode`, `obsPlacement`, `cableRoutingState`) por una pila finita de comandos (`DrawPlaneCmd`, `DrawRoofCmd`, `DrawBuildingCmd`, `MeasureCmd`, `MoveCmd`, `RotateCmd`, `OffsetCmd`) con patrón Command Undo/Redo delta sub-milisegundo. Dibujar glifos vectoriales OSNAP en el overlay 2D (cuadrado verde Fin, triángulo cian Medio, cruz roja Intersección, perpendicular magenta y líneas polares discontinuas) e incorporar un *Value Control Box* donde teclear `12.5, 45` + `Enter` en mitad de cualquier trazo confirme geometría al milímetro, más transformación multi-objeto conjunta en el Gizmo 3D.
- **Criterios de aceptación:** Trazar cubierta completa y desplazar grupos mixtos placa+obstáculo con teclado numérico y precisión milimétrica sin abrir modales.

### `V2-F7-02` — GPU Instancing Real + BVH de 2 Niveles para Plantas Utility (10k–50k Paneles)
- **Especificación:** Reemplazar la duplicación de vértices por panel (`app-main.js:6785-6811`) por malla unitaria compartida instanciada con shader único que combine textura PBR de silicio y tintado por instancia (Heatmap / String / Selección), cambiando de modo visual en `< 2 ms` sin reconstruir primitivas. Acompañar de un BVH de 2 niveles (`AABB faldón -> R-Tree/Grid UV`) compartido como SSOT para picking, marquesina, OBB clash y cinta métrica.
- **Criterios de aceptación:** 25.000 paneles orbitando a `>= 60 FPS`, picking `< 0,5 ms` y cambio PBR ↔ Heatmap ↔ String instantáneo.

### `V2-F7-03` — Detección Automática de Cubiertas DSM/3D Tiles + Straight-Skeleton + Section Box 6 Planos
- **Especificación:** Muestrear nube de puntos densa de 3D Tiles (`clampToHeightMostDetailed` / multi-rayo `pickPosition`) + WCS PNOA-IGN en Worker con RANSAC multi-plano + extracción de contorno Douglas-Peucker para proponer faldones con 1 clic. Sustituir la heurística L-building por un resolvedor *Straight-Skeleton / Weighted-Offset* válido para plantas cóncavas `L/U/T/H` con faldones estrictamente coplanares. Completar el Section Box con 6 planos interactivos arrastrables afectando simultáneamente 3D Tiles, edificios y CAD.
- **Criterios de aceptación:** Geometrías en L/U/T sin alabeos independientemente de anchos asimétricos y detección automática de tejados inclinados reales sobre Google 3D Tiles.

### `V2-F7-04` — Motor Único Horario/Cuartohorario `8760h` / `35040` Co-Simulado
- **Especificación:** Consolidar los 4 motores temporales actuales (`solar-worker` 192 instantes, `financials` 288, `bishop` 288 sintéticos, `datadis` 8760 horizontal) en una única tubería en Web Worker (`Float32Array`) basada en TMY PVGIS/NASA + Perez 1990 (con `dayOfYear`) + máscara horaria de sombras 3D por sub-string -> curva I-V Bishop con eficiencia multi-tensión `.OND` y clipping en bus AC de inversor -> generación eólica 8760h -> despacho BESS MPC/TOU -> optimización mensual CNMC 3.0TD/6.1TD de potencias P1..P6 sobre los 35.040 cuartos de hora reales.
- **Criterios de aceptación:** Cifras 100 % trazables desde la física de sub-string hasta el cashflow anual y la factura P1..P6 desde un único cálculo maestro.

### `V2-F7-05` — Suite Bancable Post-Impuestos, Protección REBT Completa y Bifacial 2D
- **Especificación:** Modelar incertidumbre correlacionada (sesgo TMY/transposición/degradación) frente a no correlacionada en Monte Carlo 25 años con flujo DCF corporativo post-impuestos (IVA neutro empresa, escudo DA 17ª vs amortización lineal, EBITDA, DSCR/LLCR) sincronizado con todos los PDFs. Añadir cálculo REBT de corriente de cortocircuito (`I_cc`), verificación térmica `I²t`, optimizador automático cobre `S_dc`/`S_ac` sujeto a `ΔV_dc+ac <= 2,5%` y modelo de factor de vista 2D bifacial (Marion/PVsyst) con GCR y albedo real.
- **Criterios de aceptación:** Identidad contable absoluta entre UI, Memoria, Presupuesto y Dossier en escenarios P50/P75/P90/P99 particulares y B2B.

### `V2-F7-06` — Interoperabilidad Industrial PVsyst (`.PAN`/`.OND`/`.PVC`) y CAD DXF IEC 60617
- **Especificación:** Ingerir modelo completo de 1 diodo PVsyst (`RShunt`, `RSerie`, `RSh0`, `RShExp`, `Gamma`, `mPmpp`, curva IAM) y curvas de eficiencia multi-tensión `.OND` (`ProfilPIO`) directo al motor Bishop I-V; añadir exportación de escenas de sombreado `.PVC` para PVsyst y planos DXF vectoriales completos con bloques normalizados IEC 60617, numeración de strings y rutas de bandejas acotadas.
- **Criterios de aceptación:** Apertura directa de `.PVC` y `.DXF` generados en herramientas externas estándar sin errores de capas ni bloques.
