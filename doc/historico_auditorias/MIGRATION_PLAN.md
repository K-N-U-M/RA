# 🏗️ MIGRATION_PLAN.md — Estrategia de Migración Técnica RA

> **Para agentes de IA:** Este documento describe los riesgos técnicos de la migración.  
> El flujo objetivo es de **5 pasos canónicos** (ver `AGENTS.md`).  
> **REGLA ABSOLUTA: Nunca ejecutar más de una fase sin confirmación explícita del usuario.**

---

## 📊 Estado actual (línea base)

| Indicador | Valor |
|---|---|
| Tamaño `index.html` | ~15.500 líneas, ~840 KB |
| Archivos JS módulos | 16+ archivos en `js/` (carga global, sin ESM) |
| Variables globales `window.*` | ~35 variables dispersas |
| CSS embebido | ~4.000 líneas en `<style>` dentro de `index.html` |
| Sistema de build | Ninguno (HTML estático) |
| Tipado | Ninguno |
| Tests | Suite Node.js en `scratch/run_full_verification.js` |
| Stepper actual en DOM | 7 botones — **OBSOLETO. Target: 5 botones canónicos** |

---

## ⚠️ Análisis de Riesgo por Tipo de Cambio

| Cambio | Riesgo | Motivo |
|---|---|---|
| Reescribir HTML stepper (7→5 botones) | 🟡 Medio | Hay referencias a IDs legacy en JS; mapear con cuidado |
| Fusionar contenedores de pasos | 🟡 Medio | Validar que todos los IDs referenciados en `working-plane.js` e `index.html` siguen existiendo |
| Añadir guards en orquestador | 🟢 Bajo | Solo lógica JS sin tocar renderizado |
| Extraer CSS a archivos | 🟢 Bajo | Solo presentación |
| Migrar a ESM (`import`/`export`) | 🔴 **MUY ALTO** | Rompe todos los `onclick` HTML inline y `window.*` globales |
| Store centralizado (Redux-like) | 🔴 **MUY ALTO** | Requiere refactorizar cada lectura/escritura de estado |
| Introducir Vite como bundler | 🟡 Medio | Cambia modelo de carga; puede romper orden de scripts |
| Separar Engine/Renderer | 🔴 **MUY ALTO** | `wpFastRenderSimulatedPanels` tiene 500+ líneas de lógica mixta |

**Conclusión:** La migración del stepper (Fase A del plan maestro) es de riesgo medio-bajo. Las fases más profundas (modularización ESM, store centralizado) son de riesgo muy alto y no están en el roadmap inmediato.

---

## 🗺️ Fases de Migración (Ordenadas por Prioridad y Riesgo)

### ✅ FASE 0 — Saneamiento de Referencias de Scope (COMPLETADA)
**Problema resuelto:** Las variables `scene` y `camera` declaradas con `const` en `index.html` no eran accesibles desde los IIFEs de los módulos JS externos.  
**Solución aplicada:** Reemplazar todas las referencias directas a `scene` y `camera` en `working-plane.js` por `viewer.scene` y `viewer.camera` obtenidos defensivamente vía `typeof viewer !== 'undefined' && viewer`.  
**Archivos modificados:** `js/working-plane.js`.

---

### 🔄 FASE A — Stepper de 5 Pasos (EN CURSO)
**Objetivo:** Reemplazar el stepper de 7 botones del DOM por los 5 pasos canónicos.

**Mapa de migración de IDs:**

| ID Antiguo (a eliminar) | Se convierte en / Mueve a |
|---|---|
| `wp-step-1-btn` (PLANO) | `wp-step-1-btn` (EMPLAZAMIENTO) — mismo ID |
| `wp-step-2-btn` (CUBIERTA) | Fusionado en `wp-step-1-content` |
| `wp-step-3-btn` (OBSTÁCULOS) | Fusionado en `wp-step-1-content` |
| `wp-step-4-btn` (OBJETIVO) | `wp-step-3-btn` (ANÁLISIS SOLAR) |
| `wp-step-5-btn` (EQUIPOS) | `wp-step-4-btn` (INGENIERÍA) |
| `wp-step-6-btn` (ARRAYS) | `wp-step-2-btn` (CAMPO SOLAR) |
| `wp-step-7-btn` (INFORME) | `wp-step-5-btn` (ENTREGA) |

**Contenedores de contenido (IDs DOM):**

| ID Nuevo | Contenido |
|---|---|
| `wp-step-1-content` | Tarjetas: Plano de trabajo + Faldones/Cubierta + Obstáculos 3D |
| `wp-step-2-content` | Módulo FV + Layout + Sliders β/Azimut + Portrait/Landscape |
| `wp-step-3-content` | Factura + Objetivo kWh + Simulación + Heatmap |
| `wp-step-4-content` | Catálogo inversor/batería + Cableado DC/AC + Validaciones |
| `wp-step-5-content` | Balance financiero + Exportación PDF |

**Riesgo principal:** funciones como `step3UpdateHardwareSelection`, `populateStep3EquipmentSelectors` que referencian el número de paso antiguo. Deben ser renombradas a `step4*` al fusionarlas.

---

### 🔲 FASE B — Consolidación del Paso 1 (EMPLAZAMIENTO)

Reorganizar las tarjetas de herramientas del Paso 1 en sub-secciones colapsables con chevron:
- 🏠 **Plano de Trabajo** (actualmente Paso 1)
- ✏️ **Faldones / Cubierta** (actualmente Paso 2)  
- 🧱 **Obstáculos 3D** (actualmente Paso 3)

---

### 🔲 FASE C — Consolidación del Paso 2 (CAMPO SOLAR)

Mover el panel de layout de paneles y sliders del antiguo Paso 6 al nuevo Paso 2.

---

### 🔲 FASE D — Consolidación del Paso 3 (ANÁLISIS SOLAR)

Unificar auditoría de factura (antiguo Paso 4) + controles de heatmap + gráfico mensual.

---

### 🔲 FASE E — Consolidación del Paso 4 (INGENIERÍA)

Unificar catálogo de equipos (antiguo Paso 5) + cableado DC/AC + validaciones eléctricas.

---

### 🔲 FASE F — Consolidación del Paso 5 (ENTREGA)

Limpiar y centralizar el informe PDF con los datos de todos los pasos anteriores.

---

## 🛑 Reglas de Ejecución

1. Una fase a la vez, con aprobación del usuario antes de iniciar la siguiente.
2. Hacer backup de `index.html` antes de modificar el HTML del stepper.
3. Verificar en consola de navegador que no hay errores después de cada fase.
4. El visor 3D, la tríada CAD y el gizmo universal son intocables salvo corrección de bugs activos.
