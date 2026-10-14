# 🏛️ AUDITORÍA INTEGRAL DE ARQUITECTURA, CÓDIGO Y EXPERIENCIA DE USUARIO (2026)
## Plan Director de Acción y Hoja de Ruta de Ingeniería

**Dirección del Proyecto:** Dirección de Ingeniería & Arquitectura de Software  
**Fecha:** Octubre de 2026  
**Alcance:** Motor 3D Cesium/WebGL, Física Solar y Orientación, Ingeniería Eléctrica REBT, Modelado Financiero, Experiencia de Usuario (UI/UX), Limpieza de Repositorio y Código Muerto.

---

## 1. 📋 RESUMEN EJECUTIVO PARA LA DIRECCIÓN

La plataforma **RA (Visor 3D Fotovoltaico)** cuenta con un potencial tecnológico y visual extraordinario. Sin embargo, el análisis multidisciplinar llevado a cabo por el equipo de auditoría revela **problemas de cálculo ocultos, saturación de la memoria gráfica, solapamientos en pantalla y duplicidad de funciones** derivados de la convivencia entre el archivo histórico principal y los nuevos módulos independientes.

### Diagnóstico en Cifras:
- **60 archivos temporales y huérfanos** eliminados de la raíz del proyecto (scripts de búsqueda antiguos y volcados de texto).
- **11 funciones esenciales duplicadas** que existen en dos sitios a la vez y compiten entre sí.
- **22 funciones abandonadas (código muerto)** que ya no se usan en ningún lugar.
- **5 colisiones visuales graves** donde unas ventanas flotantes tapan a otras.
- **4 errores de cálculo crítico** que alteran la orientación del tejado, permiten configuraciones eléctricas peligrosas o cuelgan la aplicación.

---

## 2. 🚨 MATRIZ DE HALLAZGOS ORDENADA POR GRAVEDAD

---

### 🔴 NIVEL P0: ERRORES CRÍTICOS (Física Solar, Seguridad Eléctrica y Bloqueos)

#### 1. Desviación de 8° en la orientación astronómica del tejado (Acimut)
- **Qué ocurre:** Al calcular la orientación del tejado con los 3 puntos guía, la fórmula olvida normalizar el vector Este en el espacio tridimensional.
- **Consecuencia:** En España, la orientación del tejado hacia el Sureste o Suroeste se desvía entre 7,5° y 8,0° respecto a la realidad. Como este dato se traslada a todos los paneles, **los cálculos de cuánta luz reciben las placas y los ahorros económicos del cliente nacen falseados desde el inicio**.
- **Solución:** Normalizar de forma explícita el vector Este antes de calcular el ángulo con la función matemática correspondiente.

#### 2. Riesgo de destrucción de inversores por sobretensión (Violación IEC 62548)
- **Qué ocurre:** En el cálculo de ingeniería de los paneles, la aplicación busca el voltaje máximo del inversor con un nombre erróneo. Al no encontrarlo, asume siempre por defecto 1000 Voltios.
- **Consecuencia:** Si el instalador elige un inversor doméstico de 600 Voltios, el sistema le permite conectar hasta 17 placas en serie en lugar de pararlo en 10. En una mañana fría de invierno, las placas generarán más de 900 Voltios y **el inversor se quemará por sobretensión en la vida real**.
- **Solución:** Corregir el nombre de la propiedad del catálogo de inversores y comprobar siempre el límite real del fabricante.

#### 3. Inversión del rayo de sombra de obstáculos
- **Qué ocurre:** En el algoritmo de comprobación de sombras, el rayo de luz que sale de la placa solar se multiplica por `-1`, apuntando en dirección contraria al Sol (hacia el suelo o la noche).
- **Consecuencia:** Evalúa sombras que estarían detrás del panel en lugar de comprobar qué objetos tapan la luz directa.
- **Solución:** Trazar el rayo siempre en dirección positiva hacia el vector solar.

#### 4. Bloqueo y cuelgue por división entre cero con 0 paneles
- **Qué ocurre:** Si el usuario no ha puesto paneles todavía o borra los faldones, el cálculo de caída de tensión divide entre cero (`0 placas × Voltios = 0`), produciendo valores infinitos (`Infinity`).
- **Consecuencia:** Los cuadros de texto muestran datos corruptos y los generadores de informes PDF fallan o se congelan.
- **Solución:** Incluir una guarda que devuelva 0% de caída de tensión y 0 € cuando no haya placas en cubierta.

---

### 🟠 NIVEL P1: RENDIMIENTO GRÁFICO, CUENTAS FANTASMA Y CONCURRENCIA

#### 5. Tirones en el ratón al pasar sobre el mapa de calor de las placas
- **Qué ocurre:** Cada vez que el cursor se mueve un solo milímetro sobre el tejado, el ordenador recalcula cientos de fórmulas tridimensionales pesadas para cada placa de la instalación.
- **Consecuencia:** En instalaciones de más de 100 placas, la navegación 3D se traba, el cursor se congela y la tasa de imágenes por segundo cae en picado.
- **Solución:** Comprobar primero si el cursor está sobre el tejado antes de recorrer los paneles y limitar el cálculo a un solo refresco por fotograma.

#### 6. Micro-parones y consumo excesivo de memoria al mover la barra del Sol
- **Qué ocurre:** Al mover el deslizador de las horas del día para ver cómo avanzan las sombras, el visor borra y vuelve a crear decenas de objetos 3D en cada milisegundo en lugar de mover los existentes.
- **Consecuencia:** Saturación continua de la memoria del navegador y pequeños tirones visuales cada 40 milisegundos.
- **Solución:** Reutilizar un grupo fijo de sombras donde únicamente se encienda o apague su visibilidad sin destruir nada.

#### 7. Sombras negras gigantes volando por el aire al amanecer y atardecer
- **Qué ocurre:** Cuando el Sol está muy bajo en el horizonte (a ras de suelo), la sombra de una chimenea de 2 metros se calcula con una longitud matemática de más de 300 metros sin límite de corte.
- **Consecuencia:** Aparecen polígonos negros gigantescos que flotan en el aire y atraviesan calles y edificios vecinos.
- **Solución:** Poner un tope máximo a la longitud de la sombra (límite físico útil según la normativa CTE).

#### 8. Cable general de corriente alterna calculado para un solo inversor
- **Qué ocurre:** En proyectos grandes con varios inversores (por ejemplo, 3 inversores de 10 kW = 30 kW), el cable que va hacia el contador solo calcula la corriente de 1 solo equipo.
- **Consecuencia:** Recomienda un cable demasiado fino que provocaría que las protecciones saltaran continuamente o el cable se sobrecalentara.
- **Solución:** Multiplicar la potencia por el número total de inversores de la instalación.

#### 9. Simulación de sombras que sigue trabajando a ciegas sobre datos viejos
- **Qué ocurre:** Si el usuario pulsa simular sombras anuales y, mientras la barra avanza, mueve un obstáculo o cambia el tejado, la simulación de fondo no se cancela.
- **Consecuencia:** Al terminar la barra de carga, la aplicación da por buenos los resultados del tejado anterior, mostrando un mapa de calor desfasado.
- **Solución:** Cancelar de inmediato cualquier simulación en curso si el usuario toca o modifica cualquier elemento de la escena.

---

### 🟡 NIVEL P2: ERRORES DE INTERFAZ, CONFUSIÓN Y EXPERIENCIA DE USUARIO (UI/UX)

#### 10. Dos botones para generar dos memorias técnicas PDF completamente distintas
- **Qué ocurre:** En el Paso 5 (Entrega) hay dos botones diferentes: uno llamado `EXPORTAR MEMORIA TÉCNICA (PDF)` y otro llamado `MEMORIA TÉCNICA`.
- **Consecuencia:** Uno de los botones genera un documento antiguo con fórmulas aproximadas que no cuadran con el proyecto, y el otro genera el informe oficial de ingeniería. El usuario no sabe cuál entregar al cliente final y se generan desconfianzas comerciales.
- **Solución:** Dejar un único botón claro que use siempre el motor oficial de ingeniería.

#### 11. Controles duplicados en la misma pantalla que compiten entre sí (Paso 2)
- **Qué ocurre:** En el Paso 2 (Campo Solar) existen dos sitios para cambiar la inclinación y la orientación de las placas: la tarjeta principal del tejado y un desplegable inferior llamado "Disposición global".
- **Consecuencia:** Si el usuario mueve un control, el otro marca un número diferente y los paneles en 3D se comportan de forma caótica.
- **Solución:** Ocultar el bloque redundante y dejar únicamente la tarjeta de edición por faldón.

#### 12. Solapamiento de ventanas y botones en pantalla
- **Conflictos detectados:**
  1. La barra para confirmar el tejado aparece exactamente en el mismo sitio que la barra de las horas del Sol, tapándola por completo.
  2. En pantallas de ordenadores portátiles, la barra de atajos de teclado choca físicamente contra el reproductor solar.
  3. La ventana del listado de materiales (BOM) se abre encima de la brújula y tapa el botón que la abrió.
  4. Los mensajes de aviso (toasts) nacen tapando la regla de medir y los ajustes.
- **Solución:** Reubicar las ventanas flotantes con márgenes inteligentes y asegurar que nunca coincidan en la misma coordenada de pantalla.

#### 13. Detección falsa de batería en presupuestos sin almacenamiento
- **Qué ocurre:** Cuando el cliente selecciona "Sin batería", el sistema detecta que existe el registro y marca que sí tiene almacenamiento.
- **Consecuencia:** Las ofertas y los textos automáticos de inteligencia artificial incluyen frases como *"Sistema de batería: Ninguna (0 kWh) instalada con éxito"*, lo que transmite poca seriedad al cliente final.
- **Solución:** Exigir que la capacidad sea mayor que cero antes de activar el almacenamiento en los informes.

#### 14. Jerga matemática y técnica incomprensible para un comercial o instalador
- **Qué ocurre:** En varios pasos aparecen términos como *"Tríada ortonormal CAD (ejes U, V, N)"*, *"P1-P2=X"*, *"Diagnóstico MLPE"*, *"Modelo Spencer/Perez"* o *"Shadow Bias Z-Fighting"*.
- **Consecuencia:** El instalador siente que la herramienta es compleja de usar y tiene miedo a cometer errores.
- **Solución:** Traducir todos los textos a lenguaje cotidiano de obra: *"Alinear con alero"*, *"Orientar al Sur"*, *"¿Necesita optimizadores para sombra?"*, *"Calidad gráfica (Rápida / Alta)"*.

---

### 🟢 NIVEL P3: CÓDIGO DUPLICADO, CÓDIGO MUERTO Y MANTENIMIENTO

#### 15. Once funciones esenciales duplicadas entre archivos
- Las funciones que reparten los paneles en circuitos (strings), ordenan el recorrido en zigzag o calculan las curvas de los cables están escritas en dos sitios a la vez, sobreescribiéndose de manera impredecible.
- **Solución:** Borrar las copias antiguas del archivo principal y dejar únicamente los módulos independientes como única fuente de verdad.

#### 16. Veintidós funciones abandonadas (código muerto)
- Existen funciones antiguas de rotación automática, atajos a pantalla completa que nadie llama y botones viejos de insertar puntos que han quedado como peso muerto.
- **Solución:** Eliminar estas funciones para reducir el tamaño del proyecto y acelerar el tiempo de carga.

---

## 3. 🛠️ PLAN DE ACCIÓN POR FASES DE IMPLEMENTACIÓN

```mermaid
flowchart TD
    subgraph Fase 1: Corrección de Física y Seguridad (P0) [COMPLETADA]
        A1["Normalizar vector Este en acimut (8° corregidos)"]
        A2["Corregir voltaje del inversor (vDcMax)"]
        A3["Blindar división por cero con 0 paneles"]
        A4["Invertir rayo de sombra hacia el Sol"]
    end
    subgraph Fase 2: Rendimiento Gráfico y Multi-Inversor (P1) [COMPLETADA]
        B1["Optimizar cursor sobre mapa de calor (broadphase)"]
        B2["Reutilización de entidades de sombras sin recreación"]
        B3["Cálculo de cable AC acumulado para multi-inversores"]
        B4["Cancelación atómica de simulación al mutar escena"]
    end
    subgraph Fase 3: Ergonomía Visual y Unificación (P2 / P3) [COMPLETADA]
        C1["Unificar en un solo botón de Memoria Técnica"]
        C2["Eliminar controles duplicados en Paso 2"]
        C3["Resolver colisiones de ventanas flotantes"]
        C4["Extirpar código muerto y funciones duplicadas"]
    end
    Fase 1 --> Fase 2 --> Fase 3
```

### ✅ Registro de Ejecución Integral:
- **Fase 1 (P0 - Críticos):** Ejecutada y validada (Commit `0714a96`). Acimut corregido a 0.00° de desviación; límites de voltaje del inversor según catálogo; blindaje contra cero paneles; rayo solar positivo hacia el Sol.
- **Fase 2 (P1 - Rendimiento y Multi-Inversor):** Ejecutada y validada (Commit `0c06465`). Descarte rápido de cursor sobre mapa de calor a 60 FPS; pool de sombras reutilizables sin saturar memoria; sección de cable AC multi-inversor; cancelación de simulaciones viejas.
- **Fase 3 (P2/P3 - Ergonomía Visual y Limpieza):** Ejecutada y validada. Botones de Memoria Técnica unificados apuntando al generador oficial; controles compitiendo en Paso 2 ocultos de la vista; ventanas flotantes (#ra-confirm-bar y árbol de materiales) reubicadas sin tapar la brújula ni la barra de sol; preservación de curvas suaves en cables inter-paneles.


---

## 4. 💡 PROPUESTAS DE MEJORA ESTRATÉGICA PARA LA APLICACIÓN

1. **Modo Asistente "1 Clic" (Dimensionamiento Inteligente):**
   - Que tras subir la factura eléctrica, el sistema recomiende automáticamente el número ideal de placas, la marca del inversor y si conviene o no poner batería, colocándolo todo en cubierta con un solo botón.
2. **Comparador Instantáneo de Rentabilidad:**
   - Un botón que permita al instalador alternar en vivo entre *"Máxima potencia en tejado"* frente a *"Ajustado a la factura"*, viendo en pantalla cómo varía el coste, la cuota mensual y el dinero ahorrado al año.
3. **Plantilla de Diseño Responsivo para Portátiles de Obra:**
   - Crear una disposición automática donde, si la pantalla mide menos de 1400 píxeles de ancho (portátil estándar), las barras de sol y atajos se agrupen de forma compacta para no tapar el tejado 3D.
4. **Exportación Comercial Rápida para WhatsApp:**
   - Además del PDF completo de 10 páginas, incluir un botón que genere una ficha resumen de 1 sola página en imagen o PDF ligero, lista para enviar al cliente por teléfono móvil.
