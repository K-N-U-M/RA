# Plan Director: Arquitectura de Inversores en Cascada Asimétricos (Multi-Inversor)

**Documento:** PLAN_INVERSORES_EN_CASCADA.md  
**Estado:** Propuesta Técnica Aprobada para Desarrollo  
**Fecha:** Noviembre 2026  
**Ámbito:** Motor de Ingeniería Eléctrica, Modelado 3D, Presupuestos y Documentación Técnica  

---

## 1. Visión y Justificación Técnica

### 1.1 El Problema Actual
La plataforma modela el parque de conversión mediante un único inversor de catálogo asociado al proyecto, escalable únicamente mediante un multiplicador de unidades idénticas (`Nx` unidades gemelas). 
Esta simetría no se corresponde con la casuística habitual en cubiertas residenciales y comerciales asimétricas:
* Cubiertas principales grandes (ej. 15 kWp Sur) combinadas con cubiertas auxiliares pequeñas (ej. 4 kWp Este).
* Hibridación de autoconsumo con almacenamiento: Inversor híbrido con baterías para cargas críticas + Inversor estándar de red para generación masiva diurna.
* Escalado no lineal de potencia (ej. 10 kW + 6 kW en lugar de sobredimensionar a 2x 10 kW).

### 1.2 La Solución: Rack de Inversores en Cascada
Permitir la configuración de un **parque heterogéneo de la misma marca y ecosistema de monitorización**, operando en topología **Maestro - Esclavos** enlazados por bus de comunicación digital (RS485 Modbus RTU / SmartLogger / Dongle) compartiendo un único vatímetro inteligente en el punto frontera de red.

---

## 2. Marco Normativo y Reglas de Ingeniería

1. **RD 1699/2011 (Art. 12.2) y RD 244/2019:**
   * La potencia nominal total de la planta es la suma aritmética de las potencias nominales de todos los inversores en paralelo ($P_{ac,total} = \sum P_{ac,i}$).
   * Si $P_{ac,total} > 15\text{ kW}$, la evacuación a red general debe ser obligatoriamente trifásica a 400 V con un desequilibrio entre fases inferior a 5 kW.
2. **REBT ITC-BT-40 (Instalaciones Generadoras de Baja Tensión):**
   * Cada inversor debe disponer de su propia derivación de corriente alterna con protección magnetotérmica individual (curva C) y protección diferencial independiente (sensibilidad según fabricante, típicamente 30 mA o 300 mA Tipo A / B).
   * Las derivaciones de cada inversor confluyen en un **Cuadro de Combinación de Alterna** (AC Combiner Box) dotado de un Interruptor General Automático (IGA) de corte omnipolar antes de la línea general de acometida.
3. **IEC 62548 / UNE-EN 62305:**
   * Las cadenas fotovoltaicas (strings) deben verificarse individualmente frente a las especificaciones del inversor y canal MPPT al que están físicamente conectadas (rango de tensión MPPT, $V_{max,dc}$, $I_{sc,max}$, $I_{mp,max}$).

---

## 3. Arquitectura del Modelo de Datos

### 3.1 Estructura del Rack en la Configuración del Proyecto
Sustituir el campo plano de inversor único por un array dinámico de inversores:
```json
"inverterRack": [
  {
    "instanceId": "inv_master_1",
    "role": "master",
    "catalogId": "inv_huawei_10k",
    "brand": "Huawei",
    "model": "SUN2000-10KTL-M1",
    "kw": 10.0,
    "mppt": 2,
    "inputsPerMppt": 1,
    "hasBatteryPort": true,
    "assignedPolyIndices": [0, 1]
  },
  {
    "instanceId": "inv_slave_1",
    "role": "slave",
    "catalogId": "inv_huawei_4k",
    "brand": "Huawei",
    "model": "SUN2000-4KTL-L1",
    "kw": 4.0,
    "mppt": 2,
    "inputsPerMppt": 1,
    "hasBatteryPort": false,
    "assignedPolyIndices": [2]
  }
]
```

### 3.2 Asignación y Enlace Faldón-Inversor
* Cada polilínea/faldón contendrá la propiedad `assignedInverterId`.
* Si no se define manualmente, el motor aplicará el algoritmo de **Auto-Asignación Proporcional**:
  1. Ordenar faldones por potencia pico instalada decreciente.
  2. Emparejar el faldón de mayor potencia con el inversor de mayor capacidad.
  3. Comprobar que el ratio DC/AC de cada inversor se mantenga en el rango óptimo (1.10 - 1.35).

---

## 4. Modificaciones en el Motor de Cálculo

### 4.1 Comprobación Eléctrica Segregada por Inversor
* Las tensiones de circuito abierto a temperatura mínima de diseño ($V_{oc,Tmin}$) y las tensiones mínimas a temperatura máxima de célula ($V_{mppt,Tmax}$) se validan contra los límites del inversor al que pertenece la cadena.
* Cada inversor calcula su propio factor de sobrecarga:
  $$\text{Ratio DC/AC}_i = \frac{P_{dc,asignada,i}}{P_{ac,nominal,i}}$$

### 4.2 Dimensionado del Cableado y Protecciones AC
* **Líneas Individuales de Inversor:**
  * Cálculo de sección por criterio de caída de tensión ($\Delta V \le 1.5\%$) e intensidad admisible térmica para cada inversor según su $I_{ac,max,i}$.
  * Asignación de IGA individual y diferencial para cada equipo.
* **Línea General de Evacuación:**
  * Intensidad nominal combinada: $I_{ac,total} = \sum I_{ac,i}$ (o reparto por fases si son monofásicos en red trifásica).
  * Sección del cable general desde el Cuadro de Combinación hasta el Cuadro General de Protección (CGP).
  * IGA General de cabecera dimensionado para la suma protegida.

---

## 5. Experiencia de Usuario e Interfaz Gráfica

### 5.1 Paso 4.1 (Equipos & Conversión)
* **Contenedor "Rack de Inversores en Cascada":**
  * Tarjeta del Inversor Maestro con badge destacado, selector de modelo y potencia.
  * Botón interactivo `+ Añadir Inversor en Cascada`.
  * Tarjetas de Inversores Esclavos con selector de modelo, potencia y botón para eliminar o cambiar orden.
  * Resumen global en cabecera del rack:
    * Potencia AC total combinada ($P_{ac,total}$).
    * Ratio DC/AC medio de la planta.
    * Indicador de red: Monofásica (bloqueada si $>15\text{ kW}$) o Trifásica equilibrada.
* **Asignación en Escena 3D:**
  * Codificación por color de string diferenciando inversor (ej. tonos cian para Inversor 1, tonos ámbar para Inversor 2).
  * Etiquetas de string con prefijo de equipo: `INV1:MPPT1:S1`, `INV2:MPPT1:S1`.

---

## 6. Modelo Comercial, Presupuesto y Documentación

### 6.1 Lista de Materiales (BOM Tree)
* Desglose individual de cada inversor con su código, precio unitario de catálogo y cantidad.
* Incorporación automática de partidas auxiliares obligatorias:
  1. **Cuadro de Concurrencia de Alterna (AC Combiner Box):** Envolvente IP65 con embarrado de distribución y protecciones combinadas.
  2. **Kit de Comunicación en Cascada:** Cable apantallado LiYCY / Cat6 para bus RS485 y conectores de bucle.
  3. **Vatímetro Inteligente de Cabecera:** Monofásico o trifásico según acometida, asociado al inversor maestro.

### 6.2 Propuesta Comercial y Memoria Técnica
* La ficha de equipos de la propuesta visualiza el parque completo de inversores con su potencia individual y sumatorio.
* El esquema unifilar genera automáticamente la topología de múltiples bloques de generación convergiendo en las barras de alterna.
* La memoria descriptiva justifica el reparto de potencias en base a la geometría de la cubierta.

---

## 7. Plan de Ejecución por Fases

| Fase | Tarea Principal | Hito de Entrega |
| :--- | :--- | :--- |
| **Fase 1** | Estructura de datos en configuración y compatibilidad retroactiva | Proyectos antiguos de 1 inversor se leen como rack de 1 unidad sin romper |
| **Fase 2** | UI del Rack en Paso 4.1 con selectores dinámicos | Añadir y quitar inversores secundarios en la interfaz |
| **Fase 3** | Motor electrotécnico segregado y auto-asignación faldón-inversor | Cálculos de string y líneas AC independientes por equipo |
| **Fase 4** | Integración en BOM, Presupuesto comercial y Memoria unifilar | Presupuesto y PDF reflejando equipos desglosados y cuadro AC auxiliar |
| **Fase 5** | Batería de pruebas automatizadas de validación | Test suites completas de integridad electrotécnica y financiera |
