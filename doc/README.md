# 📚 RA — Documentación Técnica del Proyecto

> **VERSIÓN CANÓNICA v3.0** — Flujo de trabajo de **5 pasos**. Ver `AGENTS.md`.

Índice de la documentación oficial para **cualquier ingeniero humano o Agente de IA** que trabaje en el repositorio.

## Documentos

| Documento | Contenido |
| :--- | :--- |
| [01-especificaciones.md](01-especificaciones.md) | Especificaciones funcionales y no funcionales de la aplicación, módulos y normativa técnica aplicada. |
| [02-tecnologia.md](02-tecnologia.md) | Stack tecnológico, dependencias, librerías y herramientas de desarrollo/verificación. |
| [03-arquitectura.md](03-arquitectura.md) | Arquitectura del sistema: capas, módulos, estado global, flujo de datos, renderizado y eventos. |
| [04-convenciones.md](04-convenciones.md) | Convenciones de código y reglas obligatorias para agentes de IA (auditabilidad, código muerto, verificación). |
| [PLAN_MAESTRO_INGENIERIA_SOLAR_V5.md](PLAN_MAESTRO_INGENIERIA_SOLAR_V5.md) | Plan maestro de física solar y cálculo horario avanzado vigente. |
| [PLAN_BACKEND_FIREBASE_CATALOGO.md](PLAN_BACKEND_FIREBASE_CATALOGO.md) | Plan de persistencia y sincronización de catálogos en Firebase. |

## Referencias complementarias

- [`../AGENTS.md`](../AGENTS.md) — Guía operativa y fuente única de la verdad del flujo canónico de 5 pasos.
- [`../README.md`](../README.md) — Visión ejecutiva y estructura general del proyecto.
- [`../MANUAL_TECNICO_INGENIERIA_RA.md`](../MANUAL_TECNICO_INGENIERIA_RA.md) — Memoria técnica y física solar: formulación matemática y normativa REBT/IEC.
- [`../MANUAL_CIENTIFICO_TECNICO_EOLICO_HIBRIDO.md`](../MANUAL_CIENTIFICO_TECNICO_EOLICO_HIBRIDO.md) — Manual científico-técnico eólico e hibridación: física aeroelástica, ISO 9613-2 y micro-CFD.
- [`../ESPECIFICACION_ARQUITECTURA_MODULO_EOLICO.md`](../ESPECIFICACION_ARQUITECTURA_MODULO_EOLICO.md) — Especificación técnica de arquitectura AAA para desarrollo del módulo eólico.
- [`historico_auditorias/`](historico_auditorias/) — Auditorías, planes de acción y críticas de ingeniería **históricos** ya superados y archivados.

## Orden de lectura recomendado para un agente nuevo

1. `AGENTS.md` → flujo canónico de 5 pasos y reglas obligatorias.
2. `doc/01-especificaciones.md` → qué hace la app.
3. `doc/02-tecnologia.md` → con qué está construida.
4. `doc/03-arquitectura.md` → cómo está organizada y dónde vive cada cosa.
5. `doc/04-convenciones.md` → reglas antes de modificar código.
