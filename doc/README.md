# 📚 RA — Documentación Técnica del Proyecto

> **VERSIÓN CANÓNICA v3.0** — Flujo de trabajo de **5 pasos**. Ver `AGENTS.md`.

Índice estructurado de la documentación oficial para **cualquier ingeniero humano o Agente de IA** que trabaje en el repositorio.

---

## 🏛️ 1. Arquitectura y Convenciones

| Documento | Contenido |
| :--- | :--- |
| [01-especificaciones.md](01-especificaciones.md) | Especificaciones funcionales y no funcionales de la aplicación, módulos y normativa técnica aplicada. |
| [02-tecnologia.md](02-tecnologia.md) | Stack tecnológico, dependencias, librerías, Web Workers y herramientas de desarrollo/verificación. |
| [03-arquitectura.md](03-arquitectura.md) | Arquitectura del sistema: capas, módulos, estado global, flujo de datos, renderizado 3D y eventos. |
| [04-convenciones.md](04-convenciones.md) | Convenciones de código y reglas obligatorias para agentes de IA (auditabilidad, código muerto, verificación). |

---

## 📖 2. Manuales Técnicos y Memoria Científica (`doc/manuales/`)

Manuales vivos de ingeniería y física aplicada:

- [MANUAL_TECNICO_INGENIERIA_RA.md](manuales/MANUAL_TECNICO_INGENIERIA_RA.md) — Memoria técnica y física solar: formulación matemática, modelos Erbs/Perez/Hay-Davies y normativa REBT/IEC.
- [MANUAL_CIENTIFICO_TECNICO_EOLICO_HIBRIDO.md](manuales/MANUAL_CIENTIFICO_TECNICO_EOLICO_HIBRIDO.md) — Manual científico-técnico eólico e hibridación: física aeroelástica, ISO 9613-2 y micro-CFD.
- [ESPECIFICACION_ARQUITECTURA_MODULO_EOLICO.md](manuales/ESPECIFICACION_ARQUITECTURA_MODULO_EOLICO.md) — Especificación técnica de arquitectura AAA para desarrollo del módulo eólico.
- [GUIA_IMPLEMENTACION_MODULO_EOLICO.md](manuales/GUIA_IMPLEMENTACION_MODULO_EOLICO.md) — Guía práctica de integración y despliegue del subsistema eólico.
- [MEMORY.md](manuales/MEMORY.md) — Memoria viva del proyecto: decisiones de diseño, estado actual y trazabilidad de cambios.

---

## 🗺️ 3. Planes de Evolución (`doc/planes/`)

- [PLAN_MAESTRO_INGENIERIA_SOLAR_V5.md](planes/PLAN_MAESTRO_INGENIERIA_SOLAR_V5.md) — Plan maestro de física solar, sombras analíticas y cálculo horario avanzado vigente.
- [PLAN_INVERSORES_EN_CASCADA.md](planes/PLAN_INVERSORES_EN_CASCADA.md) — Arquitectura de inversores maestros y esclavos en cascada.
- [PLAN_BACKEND_FIREBASE_CATALOGO.md](planes/PLAN_BACKEND_FIREBASE_CATALOGO.md) — Plan de persistencia y sincronización de catálogos en Firebase.

---

## 🗄️ 4. Histórico y Auditorías (`doc/historico_auditorias/`)

- [`historico_auditorias/`](historico_auditorias/) — Auditorías cerradas, actas de refactorización y planes provisionales superados y archivados.

---

## 🧭 Orden de Lectura Recomendado para un Agente Nuevo

1. `AGENTS.md` → Flujo canónico de 5 pasos y reglas obligatorias.
2. `doc/01-especificaciones.md` → Qué hace la app.
3. `doc/02-tecnologia.md` → Con qué está construida.
4. `doc/03-arquitectura.md` → Cómo está organizada y dónde vive cada cosa.
5. `doc/manuales/MANUAL_TECNICO_INGENIERIA_RA.md` → Fórmulas y física de producción solar.
6. `doc/04-convenciones.md` → Reglas antes de modificar código.
