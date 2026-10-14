# 🏛️ AUDITORÍA INTEGRAL DE ARQUITECTURA, CÓDIGO Y EXPERIENCIA DE USUARIO (2026)
## Plan Director de Acción y Hoja de Ruta de Ingeniería

**Dirección del Proyecto:** Dirección de Ingeniería & Arquitectura de Software  
**Fecha:** Octubre de 2026  
**Alcance:** Motor 3D Cesium/WebGL, Física Solar y Orientación, Ingeniería Eléctrica REBT, Modelado Financiero, Experiencia de Usuario (UI/UX), Limpieza de Repositorio y Código Muerto.

---

## 1. 📋 RESUMEN EJECUTIVO PARA LA DIRECCIÓN

La plataforma **RA (Visor 3D Fotovoltaico)** cuenta con un potencial tecnológico y visual extraordinario. Tras una auditoría exhaustiva realizada por un equipo de cuatro auditores especializados (UI/UX y Flujo, Motor 3D y Física, Ingeniería Eléctrica y Finanzas, Estabilidad y Repositorio), se ha completado la radiografía definitiva del sistema.

### Diagnóstico Global Consolidado:
- **23 archivos temporales y desechables eliminados** del directorio de trabajo (`scratch/`).
- **5 documentos de auditorías pasadas archivados** en `doc/historico_auditorias/` para dejar la raíz limpia y canónica.
- **2 errores graves en física solar:** un factor multiplicador incorrecto de 1.000x en la radiación instantánea que colapsaba la producción anual a niveles absurdos, y una inversión de 180° en el ángulo de incidencia que evaluaba tejados orientados al Sur como si estuvieran al Norte.
- **3 infracciones críticas en el cálculo de cableado REBT:** cálculo de voltaje fijado artificialmente a 12 paneles falseando la caída de tensión, falta de alarma si ninguna sección comercial cumple el 1.5% de caída, e intensidad de corriente no sumada en bajantes con conectores en Y paralelos.
- **2 fallos críticos en guardado y recuperación de proyectos (.raproject):** pérdida silenciosa del faldón asignado a cada plano y pérdida de la estructura de soporte elegida (teja, chapa, triángulos a 30°, pérgolas).
- **Entidades 3D "zombi"** al deshacer la creación de planos por llamada a una función no existente en el visor.
- **Bloqueos de interfaz:** la tecla `Escape` no cancela el dibujo de tejados por error de nomenclatura, y las herramientas activas no se apagan al navegar entre pasos del flujo.
- **Modales sin acceso visual:** el panel de datos oficiales del titular y CUPS no tiene botón en la interfaz y queda tapado por la brújula y el árbol de materiales.

---

## 2. 🚨 MATRIZ DE HALLAZGOS ORDENADA POR GRAVEDAD

---

### 🔴 NIVEL P0: ERRORES CRÍTICOS (Física Solar, Seguridad Eléctrica, Pérdida de Datos y Bloqueos)

#### 1. Factor multiplicador 1.000x erróneo en radiación solar instantánea
- **Qué ocurre:** En el modelo de cálculo físico anual de radiación, el sistema multiplica por 1.000 un valor que ya venía expresado en vatios-hora por metro cuadrado.
- **Consecuencia:** La radiación instantánea se dispara a casi 1.000.000 W/m² (800 veces el sol real en la Tierra). Esto sobrecarga el modelo del inversor hasta el punto de hundir su eficiencia al 3%, haciendo que una instalación doméstica de 5 kWp en Madrid produzca entre 90 y 600 kWh al año en lugar de los 7.500 a 8.000 kWh reales.
- **Solución:** Eliminar el factor `* 1000` redundante y normalizar correctamente por la duración solar del día.

#### 2. Inversión Norte/Sur en el ángulo de incidencia astronómica
- **Qué ocurre:** La fórmula clásica de radiación solar asume que el Sur está a 0° de acimut. Sin embargo, la brújula y los faldones de la aplicación utilizan el estándar náutico donde el Norte es 0° y el Sur es 180°.
- **Consecuencia:** Al introducir 180° de acimut Sur, la fórmula matemática invierte el signo y evalúa la cubierta como si estuviera inclinada hacia el Norte sombrío, recortando artificialmente un 65% de la energía solar recibida a mediodía.
- **Solución:** Adaptar el ángulo de acimut a la convención de la fórmula restando 180° antes del cálculo trigonométrico.

#### 3. Caída de tensión en cables calculada con 12 paneles fijos en lugar de los reales
- **Qué ocurre:** Al calcular la caída de tensión reglamentaria en los cables de corriente continua, la fórmula divide siempre entre el voltaje de 12 paneles fijos, con independencia de cuántos paneles tenga la serie real.
- **Consecuencia:** En un circuito pequeño de 5 o 6 paneles, divide entre el doble de voltaje, ocultando caídas de tensión ilegales que superan con creces el límite del 1.5% exigido por el Reglamento Electrotécnico de Baja Tensión (REBT ITC-BT-40).
- **Solución:** Usar el voltaje real del circuito multiplicando los paneles exactos de esa serie por su tensión de trabajo.

#### 4. Disimulo silencioso ante sobrecalentamiento de cable sin sección comercial válida
- **Qué ocurre:** Si la distancia entre el tejado y el inversor es tan larga que ninguna sección de cable comercial cumple simultáneamente el límite térmico y la caída de tensión inferior al 1.5%, la aplicación no avisa al usuario.
- **Consecuencia:** El sistema asigna por defecto un cable de 6 mm² simulando que cumple con una caída ficticia del 1.0%, generando memorias técnicas con falsedad reglamentaria que pondrían en peligro la instalación real.
- **Solución:** Mostrar una advertencia visible en rojo con aviso de "Distancia excesiva: sección insuficiente para cumplir caída ≤1.5%".

#### 5. Corriente no sumada en bajantes troncales con conectores en "Y"
- **Qué ocurre:** Cuando dos series de paneles se unen en cubierta en paralelo mediante conectores "Y", el cable común bajante se dimensiona únicamente con la corriente de una serie.
- **Consecuencia:** El cable transporta el doble de amperios de los calculados, provocando riesgo de sobrecalentamiento y fusión del aislante.
- **Solución:** Multiplicar la corriente de diseño por el número de series en paralelo conectadas al mismo conductor.

#### 6. Pérdida de faldones y tipos de estructura al guardar proyectos (.raproject)
- **Qué ocurre:** Al exportar el archivo de proyecto, el sistema omite guardar a qué plano pertenecía cada faldón y qué estructura tenía seleccionada (teja, chapa, triángulos a 30°, pérgola).
- **Consecuencia:** Al reabrir el proyecto, todos los faldones se amontonan forzosamente en el primer plano y vuelven a la estructura coplanar plana por defecto, perdiendo el trabajo de diseño tridimensional del instalador.
- **Solución:** Serializar explícitamente el identificador del plano y la estructura en el archivo de guardado y restaurarlos íntegramente al abrirlo.

#### 7. Objetos 3D "zombi" al pulsar Deshacer (Ctrl+Z) tras crear un plano
- **Qué ocurre:** Al pulsar `Ctrl+Z` para deshacer un plano de trabajo, el gestor de deshacer invoca una función inexistente en el visor Cesium.
- **Consecuencia:** El plano se borra de la lista interna, pero su representación gráfica tridimensional (malla y bordes) permanece flotando en pantalla como un "objeto zombi" imposible de borrar o interactuar.
- **Solución:** Llamar a la función correcta de refresco de planos y destruir las entidades 3D Cesium del plano revocado.

#### 8. Bloqueo al pulsar la tecla `Escape` durante el trazado de tejados
- **Qué ocurre:** Si el usuario pulsa `Escape` para cancelar mientras dibuja una cubierta, el código llama a una función que no existe en el proyecto.
- **Consecuencia:** Se produce un error silencioso en el navegador, el modo de dibujo no se cancela y el cursor continúa soltando líneas y puntos al hacer clic, transmitiendo la sensación de que el teclado o la app se han congelado.
- **Solución:** Enlazar la pulsación de `Escape` con la función canónica de cancelación de dibujo.

#### 9. Herramientas activas que contaminan la escena al cambiar de paso
- **Qué ocurre:** Si el usuario está colocando una chimenea, marcando un plano o trazando un cable y hace clic en la barra superior para ir a otro paso, el modo de herramienta previo no se desactiva.
- **Consecuencia:** Al llegar al nuevo paso e interactuar con los paneles, de repente se coloca una chimenea no deseada o se añade un punto de plano flotante en mitad del visor.
- **Solución:** Limpiar y cancelar de forma obligatoria cualquier modo de herramienta o dibujo activo dentro de la función de cambio de paso.

---

### ⚠️ NIVEL P1: RENDIMIENTO GRÁFICO, CONCURRENCIA Y ERGONOMÍA (Alta Prioridad)

#### 10. Fuga continua de memoria gráfica en el redibujado de faldones
- **Qué ocurre:** Cada vez que se mueve un vértice o se ajusta un tejado, las líneas y rellenos se generan con nombres aleatorios y no se guardan en el grupo de limpieza de Cesium.
- **Consecuencia:** Las mallas viejas nunca se destruyen, saturando la memoria de la tarjeta gráfica y provocando parpadeos y pérdida progresiva de fluidez.
- **Solución:** Registrar todas las entidades en el grupo de limpieza del visor y destruirlas antes de cada redibujado.

#### 11. Tirones en la cinta métrica 3D por recreación de entidades y proyección masiva
- **Qué ocurre:** Cada píxel que se mueve el cursor con la cinta métrica activa (`M`), se destruyen y recrean cuatro entidades Cesium y se proyectan miles de esquinas de paneles a coordenadas de pantalla sin ningún filtro espacial.
- **Consecuencia:** Tirones visuales, micro-congelaciones y caídas a menos de 20 FPS en cubiertas con más de 100 paneles.
- **Solución:** Reutilizar entidades fijas actualizando solo su posición tridimensional e implementar un filtro espacial que solo evalúe puntos cercanos al cursor.

#### 12. Doble descuento de pérdidas térmicas y angulares en el mapa de calor
- **Qué ocurre:** En la simulación anual de 192 instantes, las pérdidas por temperatura y por ángulo de incidencia de la luz ya se descuentan en el cálculo horario. Luego, al totalizar la energía anual, se vuelve a multiplicar por un factor de rendimiento que descuenta esas mismas pérdidas una segunda vez.
- **Consecuencia:** El mapa de calor y la energía anual por panel salen castigados con un 10% menos de producción de la real.
- **Solución:** Eliminar el doble descuento en el balance final anual.

#### 13. Falta de sincronización al cambiar de inversor en ingeniería
- **Qué ocurre:** Si en el Paso 4 el usuario selecciona un inversor más potente o con más canales independientes (MPPT), la aplicación no redistribuye automáticamente las series de paneles para aprovechar las nuevas entradas.
- **Consecuencia:** El instalador ve canales vacíos y sobrecarga en otros sin que el sistema equilibre la instalación.
- **Solución:** Disparar el rebalanceo automático de series y canales MPPT cada vez que cambie el equipo inversor seleccionado.

#### 14. Error matemático (NaN) por división entre cero en financiación a 0 meses
- **Qué ocurre:** Si en el estudio económico se introduce un plazo de amortización de 0 meses (pago al contado), la fórmula de cuota mensual divide entre cero.
- **Consecuencia:** Todos los totales económicos muestran "NaN €" (error de cálculo) y los balances mensuales se corrompen.
- **Solución:** Comprobar si el plazo es cero o nulo y fijar la cuota mensual a 0 € sin calcular intereses.

#### 15. "Callejón sin salida" visual al dibujar edificios 3D
- **Qué ocurre:** Al pulsar "+ Dibujar Huella" para crear un edificio, el panel lateral oculta el botón de cancelar y la barra inferior muestra un botón confuso de "Confirmar diseño" pensado para paneles solares.
- **Consecuencia:** Si el usuario no conoce el atajo de teclado, no encuentra forma visual de salir del modo de dibujo de edificios.
- **Solución:** Añadir un botón explícito de "Cancelar huella" y sincronizar la barra inferior para edificios.

#### 16. Generación de informes PDF mientras la simulación solar está en marcha
- **Qué ocurre:** La simulación de sombras anual se calcula en segundo plano a lo largo de 192 instantes. Si el usuario pulsa generar Memoria u Oferta mientras la barra avanza, el documento se imprime con paneles a cero y gráficos vacíos.
- **Consecuencia:** El instalador entrega al cliente una propuesta con métricas financieras y balances energéticos truncados.
- **Solución:** Desactivar temporalmente los botones de generación de informes y mostrar un indicador de "Calculando..." hasta que la simulación finalice por completo.

#### 17. Ventana de Datos Oficiales y Titular (`#ra-doc-modal`) inaccesible
- **Qué ocurre:** El formulario donde se registran los datos oficiales del cliente (titular, CUPS, distribuidora, potencia contratada) no tiene ningún botón en la pantalla; solo se puede abrir pulsando la letra `D` en el teclado. Además, al abrirse, la brújula y el árbol de materiales flotan por encima tapando los campos.
- **Consecuencia:** Un usuario que no conozca el atajo jamás podrá rellenar la memoria técnica oficial, y si lo pulsa, el formulario queda parcialmente tapado.
- **Solución:** Añadir un botón visible en el Paso 5 ("Datos Oficiales de Legalización") y corregir las capas visuales para que el modal quede por encima de los elementos flotantes.

---

### 💡 NIVEL P2: ERGONOMÍA, DISCREPANCIAS NORMATIVAS Y FLUIDEZ DE INTERFAZ

#### 18. Separación entre filas de paneles insuficiente en invierno
- **Qué ocurre:** El cálculo de distancia entre filas para evitar sombras solo evalúa el mediodía exacto en invierno, en vez de asegurar las 4 horas libres de sombra (de 10:00 a 14:00) que exige el Código Técnico de la Edificación y el IDAE.
- **Consecuencia:** Los paneles sufrirán sombras directas entre filas durante dos horas al día en los meses invernales.
- **Solución:** Evaluar el ángulo solar a las 10:00/14:00 del solsticio de invierno para calcular la separación anti-autosombreado.

#### 19. Facturas eléctricas con consumos mínimos forzados
- **Qué ocurre:** La herramienta inyecta consumos mínimos artificiales al analizar facturas, impidiendo simular segundas residencias desocupadas o instalaciones de vertido íntegro a red.
- **Solución:** Permitir consumos de 0 kWh reales sin inyección artificial.

#### 20. Las ventanas emergentes no se pueden cerrar con la tecla `Escape` ni clic fuera
- **Qué ocurre:** Ningún modal de la aplicación responde al cierre por `Escape` ni al clic en el fondo oscuro exterior.
- **Solución:** Habilitar el cierre estándar con `Escape` y con clic en el fondo oscuro para todos los modales.

#### 21. El botón de Casación Inteligente MPPT parece no responder
- **Qué ocurre:** El botón situado en la sección inferior de topología inyecta sus resultados en un contenedor situado muy arriba en el panel, fuera de la vista de pantalla.
- **Consecuencia:** Al hacer clic, el usuario no ve ningún cambio bajo su cursor y asume que el botón está averiado.
- **Solución:** Desplazar suavemente la vista hacia el resultado o inyectarlo directamente debajo del botón presionado.

#### 22. Botón decorativo inútil en el Paso 5 ("VER AUDITORIA MATEMATICA PFV")
- **Qué ocurre:** El botón llama a una función que no existe en ningún archivo del proyecto.
- **Solución:** Retirar el botón muerto de la interfaz para no generar confusión.

---

### 🟢 NIVEL P3: CÓDIGO DUPLICADO, CÓDIGO MUERTO Y PULIDO VISUAL

#### 23. Acordeón duplicado e invisible en el Paso 2
- Existe un bloque de más de 100 líneas con controles de inclinación y orientación forzado a ocultarse por CSS (`display:none !important;`) que ya no se utiliza.
- **Solución:** Eliminarlo del árbol de elementos para aligerar la página.

#### 24. Cinta métrica sin indicación de sentido en desnivel vertical
- El desnivel vertical siempre se muestra como valor absoluto positivo, sin reflejar si el punto medido está por encima o por debajo del punto de inicio.
- **Solución:** Mostrar si la cota sube o baja con signos y colores intuitivos.

---

## 3. 🛠️ HOJA DE RUTA DE IMPLEMENTACIÓN POR FASES

```mermaid
flowchart TD
    subgraph Fases Previas [COMPLETADAS]
        F1["Fase 1: Corrección de Acimut y Voltajes (Commit 0714a96)"]
        F2["Fase 2: Rendimiento Gráfico y Multi-Inversor (Commit 0c06465)"]
        F3["Fase 3: Ergonomía Visual y HUDs Despejados (Commit ff1c204)"]
        F4["Fase 4: Lenguaje de Obra y Pantallas Portátiles (Commit 5ca3db6)"]
    end

    subgraph Fase 5: Física Solar, Seguridad Eléctrica y Guardado [COMPLETADA]
        P1["Corregir factor 1000x y acimut en física solar (P0)"]
        P2["Blindar cálculo de cableado REBT: voltaje real y bypass (P0)"]
        P3["Sumar corriente en bajantes con conectores Y (P0)"]
        P4["Persistir faldones, planos y estructuras en .raproject (P0)"]
        P5["Erradicar entidades zombi en Deshacer (Ctrl+Z) de planos (P0)"]
    end

    subgraph Fase 6: Estabilidad 3D Cesium y Fugas de Memoria [COMPLETADA]
        Q1["Eliminar fuga de entidades Cesium en redibujado de faldones (P1)"]
        Q2["Optimizar cinta métrica 3D: batching y filtro espacial (P1)"]
        Q3["Corregir doble descuento térmico e IAM en mapa de calor (P1)"]
        Q4["Separación entre filas según ventana CTE 4h en solsticio (P2)"]
    end

    subgraph Fase 7: Ergonomía de Flujo, Modales y Desbloqueos [COMPLETADA]
        R1["Botón cancelar en huella de edificios y Escape en tejados (P0/P1)"]
        R2["Apagado de herramientas activas al cambiar de paso (P0)"]
        R3["Botón visible para datos de legalización y capas z-index (P1)"]
        R4["Cierre universal de modales con Escape y clic exterior (P2)"]
        R5["Retirar botón muerto de auditoría matemática (P2)"]
    end

    Fases Previas --> Fase 5 --> Fase 6 --> Fase 7
```

### ✅ Registro de Ejecución Integral:
- **Fase 1 (P0 - Críticos) [Commit `0714a96`]:** Acimut corregido a 0.00° de desviación; límites de voltaje del inversor según catálogo; blindaje contra cero paneles; rayo solar positivo hacia el Sol.
- **Fase 2 (P1 - Rendimiento y Multi-Inversor) [Commit `0c06465`]:** Descarte rápido de cursor sobre mapa de calor a 60 FPS; pool de sombras reutilizables sin saturar memoria; sección de cable AC multi-inversor; cancelación de simulaciones viejas.
- **Fase 3 (P2/P3 - Ergonomía Visual y Limpieza) [Commit `ff1c204`]:** Botones de Memoria Técnica unificados apuntando al generador oficial; controles compitiendo en Paso 2 ocultos de la vista; ventanas flotantes (#ra-confirm-bar y árbol de materiales) reubicadas sin tapar la brújula ni la barra de sol; preservación de curvas suaves en cables inter-paneles.
- **Fase 4 (P2 - Lenguaje de Instalador y Portátiles de Obra) [Commit `5ca3db6`]:** Humanización de textos en UI ("Tríada CAD" → "Tamaño de Ejes 3D", "Diagnóstico MLPE" → "Ver Optimizadores / Mitigación", "Shadow Bias" → "Despegue de Sombras Anti-Parpadeo"); ajuste responsivo `@media (max-width: 1400px)` en `#ra-shortcuts-hud` para erradicar solapamiento con el control solar en pantallas de portátiles.
- **Fase 5 (P0 - Física Solar, Seguridad Eléctrica y Guardado) [Ejecutada y Verificada]:**
  - **Física Solar:** Factor `* 1000` erróneo eliminado en radiación instantánea diurna; convención de acimut en `calcPOA` corregida restando 180° para alinear la convención náutica de la brújula con Duffie & Beckman (un tejado Sur ahora produce 8.441 kWh/año frente a 595 kWh/año anteriores con PR 84.8%).
  - **Seguridad en Cables REBT:** Caída de tensión calculada con el número exacto de paneles por serie; corriente duplicada en bajantes con conectores en Y (aumentando la sección recomendada de 6 a 10 mm² para garantizar $\le 1.5\%$); telemetría de alarma en rojo si ninguna sección comercial cumple.
  - **Guardado y Apertura de Proyectos:** Serialización y recuperación de `planeIdx` y `structureType` en `.raproject`; `raNewProjectConfirm` limpia en el sitio sin romper referencias compartidas y cancela el autoguardado previo.
  - **Erradicación de Objetos Zombi:** Función real de repintado de planos conectada al pulsar `Ctrl+Z`; actualización del árbol jerárquico y del Gizmo Universal al deshacer obstáculos y edificios.
  - **Blindaje Financiero:** Cuota mensual protegida contra división por cero en plazos de 0 meses (pago al contado) erradicando valores `NaN`.
- **Fase 6 (P1/P2 - Estabilidad 3D Cesium, Memoria y Física de Separación CTE) [Ejecutada y Verificada]:**
  - **Cero Fugas en Redibujado de Faldones:** Registro estricto de las entidades de contorno y relleno (`line` y `fill`) en la colección de entidades del plano de trabajo, eliminando la fuga de memoria y acumulación de geometrías fantasma en WebGL.
  - **Cinta Métrica 3D a 60 FPS:** Erradicada la destrucción y recreación constante de entidades gráficas al mover el ratón; reutilización de pines, anillo magnético y etiqueta con visibilidad condicional (`show`); limitación de tasa de refresco a pantalla mediante `requestAnimationFrame`; filtrado visual descartando puntos situados a espaldas de la cámara; e indicación clara de sentido de desnivel con flechas visuales (`↑ (sube)` / `↓ (baja)`).
  - **Erradicación del Doble Descuento en Mapa de Calor:** Desacoplamiento del factor de rendimiento de balance de planta (`prBOS`) en el cálculo del Performance Ratio del sistema para evitar penalizar dos veces las pérdidas térmicas y angulares que el motor por instantes ya computa paso a paso.
  - **Separación de Filas según CTE DB-HE5:** Algoritmo de paso inter-filas actualizado para garantizar la ventana de 4 horas libres de sombra en el solsticio de invierno (10:00 a 14:00 hora solar, elevación $\sim 20.3^\circ$ en Madrid), evitando autosombrados invernales entre hileras de paneles.
- **Fase 7 (P0/P1/P2 - Ergonomía de Flujo, Modales Accesibles y Desbloqueos) [Ejecutada y Verificada]:**
  - **Cancelación Universal con Escape y Botón Visible:** Implementada y exportada `wpCancelDrawPoly` / `wpCancelCurrentMode` para abortar limpiamente el trazado de tejados sin errores de script; añadido botón visible `#btn-cancel-building-panel` en el panel de edificios 3D para cancelar la huella perimetral en 1 clic.
  - **Apagado Limpio al Cambiar de Paso:** `wpGoToStep` desactiva de forma atómica la cinta métrica 3D, el dibujo de polilíneas, la extrusión de edificios y la colocación de obstáculos, garantizando que el visor 3D nunca quede en un estado de cursor bloqueado al navegar por el stepper.
  - **Gestor Universal de Modales:** Implementado listener global de teclado (`Escape`) y clics en el fondo exterior (backdrop) que cierra cualquier modal abierto en la aplicación sin interferir con las herramientas de dibujo 3D.
  - **Accesibilidad del Generador Oficial de Legalización:** Elevado el z-index de `#ra-doc-modal` a `999999` para que nunca quede tapado por botones flotantes; sustituido el botón inoperativo ("VER AUDITORIA MATEMATICA PFV") por el acceso directo a los datos de legalización, titular, CUPS y proyectista colegiado (`#btn-open-doc-modal`), con enlace directo en el encabezado de expediente oficial.

---

## 4. 💡 PROPUESTAS DE MEJORA ESTRATÉGICA PARA EL PRODUCTO

1. **Asistente de Dimensionamiento en 1 Clic ("Autopilot Solar"):**
   - Diseñar un flujo automatizado donde, con solo seleccionar el tejado y cargar la factura mensual, el sistema elija la orientación óptima, coloque el número idóneo de paneles, seleccione el inversor más adecuado del catálogo y deje la propuesta lista para entregar al cliente.
2. **Integración con Datos Climáticos Satelitales Oficiales (PVGIS / ERA5):**
   - Conectar la aplicación mediante consulta satelital a las bases de datos de radiación europea (PVGIS) para que el mapa de calor y la producción anual utilicen datos meteorológicos horarios reales de las coordenadas exactas de la vivienda, elevando la precisión al nivel de herramientas bancarias internacionales.
3. **Comparador Comercial de Alternativas para el Cliente:**
   - Permitir guardar en un mismo proyecto dos opciones comerciales (por ejemplo: "Opción Básica sin Batería" frente a "Opción Autonomía Total con Batería"), generando un informe comparativo que demuestre al cliente la rentabilidad y el periodo de amortización de cada una.
4. **Exportación Universal a Planos Técnicos (CAD / BIM):**
   - Añadir la descarga de la escena en formatos estándar de ingeniería (DXF tridimensional y esquemas unifilares en PDF vectorial) para facilitar la legalización directa en colegios oficiales de ingenieros.
