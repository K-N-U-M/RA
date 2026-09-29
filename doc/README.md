# 📚 RA — Documentación Técnica del Proyecto

> **VERSIÓN CANÓNICA v3.0** — Flujo de trabajo de **5 pasos**. Ver `AGENTS.md` y `PLAN_MAESTRO_REESTRUCTURACION_FLUJO.md`.

Índice de la documentación oficial para **cualquier ingeniero humano o Agente de IA** que trabaje en el repositorio.

## Documentos

| Documento | Contenido |
| :--- | :--- |
| [01-especificaciones.md](01-especificaciones.md) | Especificaciones funcionales y no funcionales de la aplicación, módulos y normativa técnica aplicada. |
| [02-tecnologia.md](02-tecnologia.md) | Stack tecnológico, dependencias, librerías y herramientas de desarrollo/verificación. |
| [03-arquitectura.md](03-arquitectura.md) | Arquitectura del sistema: capas, módulos, estado global, flujo de datos, renderizado y eventos. |
| [04-convenciones.md](04-convenciones.md) | Convenciones de código y reglas obligatorias para agentes de IA (auditabilidad, código muerto, verificación). |

## Referencias complementarias

- [`../AGENTS.md`](../AGENTS.md) — Guía operativa y fuente única de la verdad del flujo de 5 pasos.
- [`../PLAN_MAESTRO_REESTRUCTURACION_FLUJO.md`](../PLAN_MAESTRO_REESTRUCTURACION_FLUJO.md) — Hoja de ruta de implementación por fases A–F.
- [`../MIGRATION_PLAN.md`](../MIGRATION_PLAN.md) — Estrategia de migración técnica y mapeo de IDs DOM.
- [`../MANUAL_TECNICO_INGENIERIA_RA.md`](../MANUAL_TECNICO_INGENIERIA_RA.md) — Memoria técnica: física solar, formulación matemática y normativa.

## Orden de lectura recomendado para un agente nuevo

1. `AGENTS.md` → flujo canónico de 5 pasos y reglas obligatorias.
2. `doc/01-especificaciones.md` → qué hace la app.
3. `doc/02-tecnologia.md` → con qué está construida.
4. `doc/03-arquitectura.md` → cómo está organizada y dónde vive cada cosa.
5. `doc/04-convenciones.md` → reglas antes de modificar código.