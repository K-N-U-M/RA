# Registro de Avances — Auditoría Externa AAA

> **Propósito:** Bitácora única y cronológica donde cualquier IA o desarrollador documenta la resolución de cada tarea de `doc/auditoria-externa-aaa/`.
> **Instrucciones para la IA que ejecuta un ticket:**
> 1. Al **tomar** una tarea, actualiza su `Estado` a `[En curso]` en el documento de su fase y en `00-INDICE.md`.
> 2. Implementa únicamente el alcance del ticket en una rama dedicada (respetando el nombre sugerido en cada ficha).
> 3. Verifica los **Criterios de aceptación** definidos en la ficha (sin ejecutar baterías masivas no solicitadas si hay restricción activa; limita la verificación al scope puntual del ticket o pídela si corresponde).
> 4. Al **cerrar**, marca la tarea como `[Hecho]` tanto en el archivo de su fase como en la tabla maestra de `00-INDICE.md`, y añade una nueva fila al final de la tabla siguiente (nunca borres registros previos).

---

## Historial de Tareas Ejecutadas

| Fecha (ISO) | ID Tarea | Rama | Commit | Agente / IA | Resultado | Notas / Verificación realizada |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 2026-11-24 | `INIT-DOC` | `docs/auditoria-externa-aaa` | *(commit inicial)* | Auditoría Externa AAA | `[Hecho]` | Creación de índice maestro, 8 fases auditadas basadas en evidencia verificada en código y bitácora inicial. |

---

## Plantilla rápida para copiar y añadir una nueva entrada

```markdown
| YYYY-MM-DD | `FX-XX` | `fix/nombre-rama` | `abc1234` | Nombre Modelo / IA | `[Hecho]` / `[Parcial]` / `[Bloqueado]` | Breve descripción de archivos tocados, criterio de aceptación verificado y si desbloquea tickets dependientes. |
```
