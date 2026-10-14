# 🔎 AUDITORÍA INTEGRAL v3.0 Y PLAN DE RESOLUCIÓN (2026)

**Dirección de Ingeniería — Visor Solar 3D "RA"**
**Alcance:** interfaz y flujo de trabajo, física solar, ingeniería eléctrica y guardado de proyectos, finanzas y documentos con IA, y limpieza del repositorio.
**Método:** 5 auditores especializados trabajando en paralelo sobre dominios independientes; cada hallazgo grave ha sido **verificado directamente en el código** antes de incluirlo aquí.

> Este documento sustituye a la auditoría de octubre de 2026 ya cerrada (archivada en `doc/historico_auditorias/`). Aquí solo figura lo que **sigue vivo** tras las fases 1–7 anteriores.

---

## 0. Resumen para dirección (en cristiano)

La aplicación calcula bien en general, pero el "escaparate" tiene fallos que dañan la confianza del cliente y tres bombas de relojería internas:

- **Un control de la interfaz está roto:** el desplegable para elegir el tipo de estructura de montaje, al cambiarlo, lanza un error y no hace nada.
- **Dos documentos del mismo trabajo dicen cosas distintas:** la oferta comercial muestra una rentabilidad (TIR) 100 veces inflada, y la memoria técnica escribe literalmente "**undefined años**" en lugar del plazo de retorno.
- **Al reabrir un proyecto se pierde parte del trabajo fino:** giros manuales de paneles, qué paneles llevaban electrónica, y ajustes de cubierta/estructura.
- **Las llaves de acceso a los mapas están a la vista y repetidas** en dos sitios.
- Por si fuera poco, **el reparto de la producción por meses está mal** (el verano sale muy por encima y el invierno muy por debajo), aunque el total anual cuadre.

El resto son mejoras de robustez, código duplicado, peso muerto y documentación desfasada. La limpieza del repositorio ya se ha ejecutado (sección 3).

---

## 1. Hallazgos ordenados por gravedad

Cada punto indica **qué falla**, **cómo lo nota el usuario** y **cómo se arregla** (una línea).

### 🔴 CRÍTICO — rompe, falsea un documento oficial o expone secretos

**C1. El desplegable "Estructura de Montaje" del faldón no funciona.**
Al cambiarlo salta un error de script y la estructura elegida no se aplica; la cubierta se queda como estaba.
- *Lo nota:* el instalador elige triángulos a 30° o pérgola y no pasa nada visible.
- *Causa:* la función que debe ejecutar el cambio quedó sin publicar fuera de su módulo (sus funciones hermanas sí están publicadas).
- *Arreglo:* publicar esa función igual que sus hermanas. Una línea.

**C2. La TIR de la Oferta Comercial sale 100 veces más alta.**
El motor financiero ya entrega la rentabilidad en porcentaje, pero el documento la vuelve a multiplicar por 100 → aparece, por ejemplo, **1.500 %**. Si el proyecto no es rentable, muestra "0,0 %".
- *Lo nota:* el cliente ve una rentabilidad imposible; la Memoria Técnica del mismo proyecto muestra otra cifra distinta.
- *Arreglo:* eliminar la multiplicación extra en el documento comercial y usar el valor tal cual.

**C3. La Memoria Técnica escribe "undefined años".**
La frase de conclusión lee un dato que ya no existe (se le cambió el nombre en su día).
- *Lo nota:* el documento oficial entregado al cliente/administración imprime literalmente *"un período de retorno de **undefined** años"*.
- *Arreglo:* leer el dato correcto (el plazo de retorno que sí calcula el motor).

**C4. Al reabrir un proyecto se pierde parte del diseño.**
El archivo guarda bien el giro manual de cada panel, si es manual o automático, qué módulo le tocó, si llevaba optimizador y si quedó marcado como sombreado… pero **al abrir se ignoran esos datos**. Lo mismo ocurre con el tipo de cubierta y los ajustes de estructura del faldón.
- *Lo nota:* reabre el trabajo, los paneles girados vuelven a su sitio, se pierde qué paneles llevaban electrónica y el listado de materiales/presupuesto se descuadra.
- *Arreglo:* al leer el archivo, restaurar también esos campos.

**C5. Las llaves de acceso a Google y Cesium están a la vista y duplicadas.**
Están escritas en texto plano dentro del código y **repetidas en dos archivos**.
- *Lo nota:* cualquiera con acceso al repositorio puede copiar la clave y generar consumo a tu nombre; y si se cambia en un sitio, el otro se queda con la vieja.
- *Arreglo:* dejar una sola fuente de claves, sacarlas del código y restringirlas en la consola de Google Cloud.

**C6. El reparto de la producción por meses está mal.**
El motor calcula la curva del día como si todos los días durasen 12 horas, sin ajustar al mes real: el **verano sale ~40 % por encima** y el **invierno ~60 % por debajo**. El total anual cuadra, pero los ahorros y comparativas mensuales no.
- *Lo nota:* el cliente compara meses y ve un perfil de producción irreal.
- *Arreglo:* usar la duración real de cada mes y calibrar la curva para que sume exactamente el total diario.

### 🟠 GRAVE — seguridad eléctrica latente, inconsistencias y datos poco fiables

**G1. Un cable troncal puede quedarse corto si se juntan grupos de paneles en paralelo.**
El dibujo contempla unir dos grupos (conectores en Y), pero el cálculo de la sección siempre asume un solo grupo, y además usa **dos etiquetas distintas** para lo mismo. Hoy no salta porque esa opción no está enganchada a ningún botón, pero es una bomba de relojería.
- *Arreglo:* contar el número real de grupos en paralelo y multiplicar la corriente por ese número, con una sola etiqueta de topología.

**G2. La elección automática de inversor no cuenta los paneles en paralelo.**
Solo compara la corriente de **un** módulo con el límite del inversor.
- *Arreglo:* sumar la corriente de todos los grupos que entran por la misma entrada.

**G3. Al borrar un "plano de trabajo" quedan obstáculos fantasma.**
El visor guarda la lista de obstáculos en un sitio, pero el módulo que los dibuja se queda con una copia antigua.
- *Lo nota:* borra un plano y siguen apareciendo chimeneas/árboles en el 3D, seleccionables, mientras el listado y el estudio de sombras ya los dan por eliminados. Deshacer no lo arregla.
- *Arreglo:* borrar siempre "en el mismo sitio" para que todas las partes vean la misma lista.

**G4. Se adivina si el inversor es monofásico por el texto de su tipo.**
Se busca la palabra "mono" en el nombre del equipo.
- *Lo nota:* un inversor importado con otro nombre hace que una instalación monofásica se calcule como trifásica y el cable de salida quede infravalorado.
- *Arreglo:* que la fase sea un dato propio del inversor, no algo que se adivina del texto.

**G5. El modo de cálculo "rápido/medio" usa meses equivocados.**
Al bajar la calidad para acelerar, se asignan meses incorrectos (p. ej. julio calculado como abril) y el paso de integración no coincide con el intervalo real.
- *Lo nota:* los números cambian según el modo elegido sin avisar.
- *Arreglo:* pasar el mes real y ajustar el paso al intervalo de horas evaluado.

**G6. Un mismo tejado se evalúa con dos motores distintos.**
El comparador de orientación usa un modelo de difusa más fino; el mapa de calor usa uno simplificado.
- *Lo nota:* dos pantallas dan respuestas distintas para la misma cubierta.
- *Arreglo:* unificar en un solo motor de radiación.

**G7. Los PDF se pueden generar con datos obsoletos o en plena simulación.**
Aunque avisa de que el análisis está caducado, **igual genera el documento** con la producción antigua; y no comprueba si hay una simulación en marcha.
- *Lo nota:* entrega al cliente una oferta con números viejos o a cero.
- *Arreglo:* bloquear la entrega (u obligar a recalcular) mientras el análisis esté caducado o en proceso.

**G8. El ahorro anual es distinto según el documento.**
La memoria usa un precio fijo (0,18 €/kWh); la oferta usa tarifa por horas.
- *Arreglo:* que ambos tiren del mismo cálculo.

**G9. La clave de la IA de Google viaja a la vista y se guarda sin cifrar.**
Se manda dentro de la propia dirección web y se almacena en claro en el navegador.
- *Arreglo:* mandarla en la cabecera (no en la URL) y no dejarla en claro.

**G10. Si la IA de Google se atasca, la app se queda "Analizando…" para siempre.**
Las llamadas no tienen límite de tiempo ni cancelación.
- *Arreglo:* añadir tiempo máximo y botón de cancelar.

**G11. Funciones "gemelas" muertas y caché del imán sin limpiar.**
Hay funciones que existen pero no están conectadas a ningún control (cambiar azimut, orientación, seleccionar polilínea…) y la caché del imán magnético no se vacía nunca.
- *Lo nota:* peso muerto y riesgo de que el imán use puntos viejos.
- *Arreglo:* conectar o eliminar, y limpiar la caché del imán.

### 🟡 MODERADO — robustez, consistencia y deuda técnica

**M1.** El estado del mapa de calor se guarda de dos formas distintas (sí/no y lista vacía) según el camino del código → puede dar respuestas obsoletas o "hover" mudo. *Arreglo:* un único formato y revisar quien lo lee.
**M2.** La barra mensual del PDF sale de una "plantilla" climatológica y luego se reescala al total, no de la simulación real → los meses no cuadran con el total. *Arreglo:* extraer el reparto de la simulación real.
**M3.** Un estado interno compartido entre faldones puede hacer que unos paneles hereden datos de otro. *Arreglo:* etiquetar el estado con el faldón al que pertenece.
**M4.** Se muestran "optimizadores" y un % de pérdida de sombra **inventados** (conteo mezclado y un ×35 fijo). *Arreglo:* usar los valores reales calculados.
**M5.** Hay **dos convenciones de acimut** distintas bajo el mismo nombre (una con el Sur a 0°, otra con el Norte a 0°). *Arreglo:* fijar una convención única y convertir en los bordes.
**M6.** La capacidad de los cables no se corrige por temperatura real ni por agrupamiento. *Arreglo:* aplicar factores de corrección.
**M7.** Borrar un plano no guarda "punto de deshacer" de sus obstáculos. *Arreglo:* hacer copia antes de borrar.
**M8.** El historial de deshacer está duplicado (uno de 25 pasos que no se usa y el real de 30). *Arreglo:* eliminar el duplicado.
**M9.** Los proyectos viejos no se migran: el número de versión del archivo se ignora. *Arreglo:* adaptar versiones al abrir.
**M10.** Un "0" escrito a mano en un coste o impuesto se sustituye por el valor por defecto (0 de IBI → 650 €). *Arreglo:* distinguir "0 real" de "vacío".
**M11.** Una cifra etiquetada como "ahorro acumulado" vuelve a sumar la inversión inicial. *Arreglo:* revisar etiqueta o cálculo.
**M12.** El % de autoconsumo no aparece en el resumen comercial porque el dato se busca con un nombre que no coincide. *Arreglo:* corregir el nombre.
**M13.** Doble clic en "analizar con IA" lanza dos análisis a la vez. *Arreglo:* ignorar el segundo clic mientras haya uno en curso.
**M14.** Código de ingeniería duplicado en 3 sitios (color de series, partición de paneles, cableado en serpiente, límites de tensión) y configuración del panel duplicada. *Arreglo:* una sola fuente de verdad.
**M15.** "Fachadas" públicas que nadie usa (objetos de diagnóstico, envoltorios de medición, marca, importador IA…) y una llamada a una función que no existe. *Arreglo:* limpiar lo no usado.
**M16.** No hay proyecto de build, ni linter, ni motor de tests; "automatizado" se reduce a scripts sueltos. *Arreglo:* añadir un `package.json` mínimo con linter y los tests de `tests/`.

### 🟢 MENOR — pulido y limpieza

**m1.** Algunos avisos toast muestran la palabra "warning"/"error" en lugar del mensaje real (argumentos en orden cambiado).
**m2.** La lista de "proyectos recientes" guarda los proyectos enteros en el navegador → con diseños grandes puede dejar de guardar sin avisar.
**m3.** Un comentario de la comprobación de geometría no coincide con el código (el comportamiento es correcto).
**m4.** Quedan mensajes de depuración en la consola y avisos informativos de arranque.
**m5.** 12 botones solo-icono sin texto alternativo; solo 6 elementos tienen etiqueta de accesibilidad en todo el documento.
**m6.** El botón "MEMORIA TÉCNICA" aparece dos veces en el mismo panel del Paso 5.
**m7.** Hay ~82 bloques ocultos por estilos; muchos son legítimos, pero conviene cribar si alguno quedó huérfano.
**m8.** Se prueban primero nombres de modelos de IA que probablemente no existen → cada análisis pierde una llamada antes de dar con uno válido.
**m9.** Se anuncia "192 instantes" pero se descartan las horas con el sol muy bajo (<10°): en la práctica se analizan menos.

### 📄 Documentación (contradicciones detectadas y corregidas)

- Especificaciones decían **156 instantes** y **13 horas** (lo correcto es 192 y 16). **Corregido.**
- Tecnología y arquitectura describían una capa de cálculo en otro lenguaje (`src/*.ts`) y el uso de **Three.js**, que **no existen**. **Corregido.**
- Los documentos de herramientas citaban scripts de verificación con **nombres que no existen**. **Corregido** (ahora apuntan a `tests/`).
- Planes de migración/reestructuración se presentaban como "en curso" cuando **ya estaban terminados**. **Archivados.**
- El fichero maestro estaba en minúsculas (`agents.md`) y todas las referencias en mayúsculas → enlace roto en Linux/GitHub. **Renombrado a `AGENTS.md`.**
- El manual de portada listaba **17 de 30 módulos** y una tabla de atajos desfasada. **Actualizados.**

---

## 2. Plan de resolución por fases

### Fase A — Sangrado (P0). Sin riesgo, cambios de 1–2 líneas.
- [ ] **A1.** Publicar la función del desplegable de estructura (C1).
- [ ] **A2.** Quitar la multiplicación ×100 de la TIR en la oferta (C2).
- [ ] **A3.** Leer el campo correcto del plazo de retorno en la memoria (C3).
- [ ] **A4.** Restaurar en la apertura los campos de panel y faldón omitidos (C4).
- [ ] **A5.** Centralizar las claves en una sola fuente y sacarlas del código (C5).

### Fase B — Números que ve el cliente (P0–P1).
- [ ] **B1.** Corregir la duración del día por mes y calibrar la curva diaria (C6).
- [ ] **B2.** Unificar motor de radiación entre comparador y mapa de calor (G6).
- [ ] **B3.** Corregir meses y paso en los modos de calidad rápida (G5).
- [ ] **B4.** Bloquear generación de PDF con análisis caducado o en curso (G7).
- [ ] **B5.** Unificar el ahorro anual entre memoria y oferta (G8).
- [ ] **B6.** Extraer el reparto mensual del PDF de la simulación real (M2).

### Fase C — Seguridad eléctrica y datos (P1).
- [ ] **C1.** Sumar corriente en paralelo en cable troncal y unificar la etiqueta de topología (G1).
- [ ] **C2.** Sumar corrientes en la elección automática de inversor (G2).
- [ ] **C3.** Fase del inversor como dato propio, no adivinada por texto (G4).
- [ ] **C4.** Fuente única de la lista de obstáculos (G3).
- [ ] **C5.** Migración de versiones de `.raproject` (M9).
- [ ] **C6.** Corrección térmica/agrupamiento de cables (M6).

### Fase D — Robustez e IA (P1–P2).
- [ ] **D1.** Clave IA en cabecera y almacenamiento no en claro (G9).
- [ ] **D2.** Tiempo máximo y cancelación en llamadas IA (G10).
- [ ] **D3.** Evitar doble análisis con doble clic (M13).
- [ ] **D4.** Estado unificado del mapa de calor (M1).
- [ ] **D5.** Distinguir "0 real" de "vacío" en costes (M10).

### Fase E — Limpieza y consistencia (P2–P3).
- [ ] **E1.** Eliminar/duplicar código: config de panel, utilidades repetidas, historial duplicado (M14, M8).
- [ ] **E2.** Retirar "fachadas" y llamadas muertas (M15).
- [ ] **E3.** Conectar o eliminar funciones gemelas y limpiar caché del imán (G11).
- [ ] **E4.** Añadir `package.json` con linter y ejecución de `tests/` (M16).
- [ ] **E5.** Pulido: toasts, proyectos recientes, accesibilidad, botones duplicados, consoles (m1–m9).

---

## 3. Limpieza de repositorio ejecutada

| Acción | Elemento | Motivo |
| :--- | :--- | :--- |
| 🗑️ Eliminado | 6 scripts de un solo uso en `scratch/` (fases 1/5/6/7, dirty-state, model-discovery) | Verificaciones de fases ya cerradas; sin valor recurrente |
| 📦 Movido | 3 pruebas reutilizables → `tests/` (`test-js-syntax.js`, `test-ra-full-workflow.js`, `test-equipment-ai-importer.js`) | Sacarlas del directorio desechable |
| 🗄️ Archivado | 4 planes superados → `doc/historico_auditorias/` | Documentos ya ejecutados que confundían |
| ✏️ Renombrado | `agents.md` → `AGENTS.md` | Coincidencia exacta con las referencias; portabilidad Linux |
| ⚠️ Pendiente (no tocado) | `node_modules/` (Puppeteer, Zod…) sin `package.json` | Peso muerto no versionado; decidir borrado en disco aparte |

> `scratch/` queda vacío y se elimina del control de versiones al no contener archivos.

---

## 4. Documentación actualizada

- `doc/01-especificaciones.md` — 16 horas y 192 instantes.
- `doc/02-tecnologia.md` — eliminadas capa inexistente y Three.js; inventario completo de 30 módulos; rutas de pruebas corregidas.
- `doc/03-arquitectura.md` — diagrama sin capas fantasma; ubicaciones reales del estado global.
- `doc/04-convenciones.md` — nombres y rutas de verificación corregidos.
- `README.md` — inventario de módulos y tabla de atajos canónica.
- `AGENTS.md` — referencias a la documentación vigente.
- `MEMORY.md` — nueva sección 23 con esta auditoría y la limpieza.

---

## 5. Propuestas de mejora estratégica

1. **Asistente "Autopilot Solar" en 1 clic.** Con el tejado y la factura cargados, que el sistema elija orientación, número de paneles e inversor y deje la propuesta lista para entregar.
2. **Datos climáticos satelitales (PVGIS/ERA5).** Consultar radiación horaria real de las coordenadas exactas para subir la precisión al nivel "bancable".
3. **Comparador comercial de alternativas.** Guardar dos opciones (p. ej. "sin batería" vs "autonomía total") y generar un informe comparativo de rentabilidad.
4. **Exportación a CAD/BIM.** Descarga en DXF 3D y esquemas unifilares vectoriales para legalización directa en colegios oficiales.
5. **Panel de "salud" del proyecto.** Semáforo único que avise de: análisis caducado, cable infravalorado, documento con datos de ejemplo, o claves sin configurar.
6. **Onboarding guiado de 5 pasos.** Un recorrido inicial que evite que el usuario novato entregue documentos a medio rellenar.
7. **Pruebas automáticas en CI.** Ejecutar `tests/` en cada cambio para blindar los cálculos eléctricos y financieros.

---

## 6. Cómo verificar cada arreglo

- **UI:** cambiar la estructura del faldón y comprobar que la cubierta cambia.
- **Documentos:** mismo proyecto → comparar la TIR de la memoria y de la oferta (deben coincidir) y buscar "undefined" en el PDF de la memoria.
- **Datos:** girar un panel a mano, marcarlo manual, asignar módulo/electrónica, guardar, cerrar, reabrir y comprobar que todo vuelve igual.
- **Física:** comprobar que la suma de los 12 meses coincide con el total anual y que el perfil estacional es coherente (más en verano que en invierno, sin saltos de +40 %/−60 %).
- **Eléctrico:** montar un caso con dos grupos en paralelo y comprobar que la sección del cable vuelve a calcularse con el doble de corriente.
- **Consola:** no debe aparecer ningún error rojo al cambiar la estructura del faldón.

---

*Auditoría v3.0 — octubre 2026. Los hallazgos graves han sido verificados en código; el resto proviene de la revisión especializada por dominio.*
