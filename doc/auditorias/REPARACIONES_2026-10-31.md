# 🔧 REPARACIONES AUDITORÍA v2 — LISTA VIVA DE TRABAJO

> **Fuente:** `AUDITORIA_SEGURIDAD_RENDIMIENTO_ARQUITECTURA_2026-10-29.md` (secciones 1, 2 y 3).
> **Regla de uso:** se actualiza en cada interacción. `[x]` hecho y verificado, `[~]` en curso, `[ ]` pendiente. El detalle técnico de cada hallazgo vive en la auditoría, no aquí.
> **Propiedad:** (A) = lo hace el agente; (U) = lo hace el usuario en sus consolas (no es trabajo de código).

---

## FASE 0 — URGENTE

- [ ] (U) SEC-01: crear clave de mapas y token del visor NUEVOS con restricciones (dominio + API + cuota), actualizar el fichero local de entorno, redesplegar y solo entonces revocar las viejas. Comprobación final: la web pública ya no muestra las claves viejas.
- [ ] (U) SEC-02: con la rotación hecha → revocar antiguas, limpiar el historial del repositorio y activar la protección de secretos en GitHub.
- [x] (A) SEC-03: no permitir que el servidor local sirva el fichero de credenciales (y su plantilla) + ampliar su prueba de la batería de seguridad. → `2026-10-31`
- [x] (A) SEC2-01: resumen de IA saneado por la vía oficial (adiós al parche de lista negra), con saneado de reserva para entornos sin el sanitizador oficial (tests). → `2026-10-31`
- [~] (A) SEC2-02…09: módulo central de saneado cargado en la página + escapes en la oferta (valores de plantilla escapados en quien los envía), dossier (marca+cliente en origen en ambas vías, campos del modal, restauración de borrador con saneado autónomo), textarea de plantillas y fotos. → `2026-10-31, salvo SEC2-09 (datos de terceros en PDFs)`
  - Nota de estrategia: el escape de plantillas se hace en QUIEN ENVÍA los valores (dossier/finanzas) y NO dentro del motor de plantillas, para evitar doble escape; en Fase 2 se puede unificar en el motor con cuidado.
- [x] (A) PERF2-01: anillos/estela del molinillo sin reconstruirse al arrastrar (solo matriz) + reconstrucción única al reposar (150 ms). → `2026-10-31`
- [x] (A) PERF2-02: cadencia 125 ms (~8 Hz) con pase final garantizado al expirar la ventana (cancelado al limpiar la capa). → `2026-10-31`
- [x] (A) PERF2-04: capa de paneles persistente — si el panelado no cambia de sitio, solo se retintea el color de las piezas tocadas (cero reconstrucción). → `2026-10-31`
- [ ] (A) Actuaciones del plan de la página que necesitan pruebas: Batería + verificación tras cada tanda.

## FASE 1 — ESTA SEMANA

- [ ] (A) SEC2-10: validar rangos de la producción externa (comprobación con la fuente de verdad local antes de Presupuestos/TIR).
- [ ] (A) PERM2-04: limpieza del mecanismo anti-abuso del recurso externo (sweep + clave confiable).
- [ ] (A) SEC-05: carga de proyectos blindada (asignación segura sin claves peligrosas + validación de esquema).
- [ ] (A) PERF2-07/09/10: suavizar el panel eólico (sliders con pausa, árbol dibujado una vez, catálogo de obstáculos en caché).
- [ ] (A) SEC2-12/13: escapes de bajo riesgo restantes (outliner y árbol de materiales). (SEC2-11 y 14 ya cerrados en Fase 0, 2; SEC2-15 queda como excepción justificada — dato numérico puro)
- [ ] (U) SEC-07: activar la protección anti-abuso del proyecto cloud en modo monitor.

## FASE 2 — CONSOLIDACIÓN

- [ ] (A) SEC-06: búsquedas y cotas por la vía oficial del navegador o por un recurso intermedio propio (nada de claves en la URL).
- [ ] (A) PERF2-03: análisis de sombras en un trabajador en segundo plano.
- [ ] (A) PERF2-05/06/08: micro-optimizaciones del arrastre y del ratón (hoistas, render selectivo, filtro por edificio activo).
- [ ] (A) SEC-01 (definitivo): inyección de claves en el despliegue (publicar solo marcador).
- [ ] (A) SEC-08: límite de ritmo del recurso de viento local.
- [ ] (A) ARC-01: unificar el lector de recursos eólicos (espejo + prueba de paridad).
- [ ] (A) PERM2-01: capear el tamaño del documento cloud (o repartirlo).
- [ ] (A) ARC2-02: contador de estadísticas inicializado una sola vez, desde módulo.
- [ ] (A) PERF-01: service worker + ficheros versionados con caché larga.

## FASE 3 — EVOLUCIÓN

- [ ] (A) ARC2-03/04/05: despiece del módulo nuevo de estilo, funciones más pequeñas, estilo moderno y alias de marca en el namespace global.
- [ ] (A) QUA-01/02/03: linter global, tipado progresivo, recogida de scripts de parcheo en su carpeta.
- [ ] (A) SEC-09 / PERM-01: reglas con blindaje de campos sensibles y marca com WM.
- [ ] (A) Observabilidad: envío del registro de errores a un servicio externo (opcional).

## 📔 Log de interacciones

- **2026-10-31 (1):** lista creada; blindaje del servidor local (SEC-03) + su prueba; módulo de saneado creado; resumen IA por la vía oficial; SEC2-01 y SEC2-07 cerrados; escapes en imágenes de memorias (SEC2-14).
- **2026-10-31 (2):** ola XSS prácticamente cerrada: SEC2-03 (dossier, ambas vías de maquetación: marca, cliente, dirección, tarifas...), SEC2-06 (6 campos del modal escapados), SEC2-05 (borrador restaurado con saneado autónomo dentro de la ventana generada), SEC2-02 (valores de plantilla escapados en quien envía: dossier + oferta), SEC2-11 (textarea de plantillas), módulo de saneado conectado a la página. Validación: sintaxis 74 módulos ✓, endurecimiento del servidor ✓, test de redacción IA ✓ (ajustado el fallback sin sanitizador oficial). **Pendiente:** SEC2-09 (datos de terceros en PDFs), hotfixes de arrastre PERF2-01/02/04, luego Fase 1.
- **2026-10-31 (3):** hotfixes del arrastre cerrados. PERF2-01: anillos/estela del molinillo con geometría estática en su marco local → en vivo solo se actualiza la matriz maestra; la reconstrucción completa (sombra de suelo proyectada, dependiente de la posición) se difiere a un pase único con temporizador de 150 ms que se cancela con cada movimiento (equivalente funcional al soltar el clic). PERF2-02: cadencia de sondeo 30→125 ms y pase final programado al expirar la ventana, para que el último gesto del arrastre nunca quede sin evaluar. PERF2-04: la capa del sondeo es persistente (sentinela de los 4 vértices por panel) y si la geometría está intacta se re-tintea SOLO por atributos de instancia las piezas cuyo color cambió; si la primitiva no está lista o el API no responde, cae automáticamente al rebatch completo. Validación: sintaxis 74 ✓, test del sondeo solar ✓, wind (AEP/Betz/catálogo) ✓. **Pendiente:** SEC2-09 (terceros en PDFs), SEC2-12/13, Fase 1 completa, empaquetar y subir todo.
