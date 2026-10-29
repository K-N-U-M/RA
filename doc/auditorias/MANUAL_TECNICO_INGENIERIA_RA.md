# ☀️ MEMORIA TÉCNICA Y MANUAL DE INGENIERÍA: SIMULADOR SOLAR 3D (RA)
**Documento Técnico de Arquitectura, Algoritmos, Física Solar y Operación Industrial**  
*Versión: 3.0-AAA Industrial Grade*  
*Fecha: Agosto 2026*  
*Autor: Equipo de Ingeniería y Arquitectura Solar RA*

---

## 📑 ÍNDICE GENERAL
1. **Visión General y Propósito del Software**
2. **Catálogo Exhaustivo de Funcionalidades**
3. **Fundamentos de Ingeniería y Funcionamiento Real en Industria**
4. **Formulación Físico-Matemática y Modelos de Cálculo**
5. **Algoritmos y Arquitectura Tecnológica del Motor de Simulación**
6. **Normativa Técnica y Estándares Internacionales de Cumplimiento**

---

## 1. 🌐 VISIÓN GENERAL Y PROPÓSITO DEL SOFTWARE

**RA** es una plataforma de ingeniería fotovoltaica de alta fidelidad basada en entornos web 3D. Combina la precisión astronómica y radiativa de herramientas analíticas de laboratorio (**PVsyst**) con la capacidad de modelado geométrico y de sombras en tiempo real de soluciones CAD avanzadas (**PVcase, Helioscope, Aurora Solar**), operando directamente sobre mallas de fotogrametría 3D fotorrealistas (Google 3D Tiles, OpenStreetMap y modelos digitales de elevación).

---

## 2. 📋 CATÁLOGO EXHAUSTIVO DE FUNCIONALIDADES

### 2.1. Navegación Geoespacial y Entorno 3D
* **Gemelo Digital Planetario**: Visualización 3D fluida mediante CesiumJS con mallas fotorrealistas de Google Photorealistic 3D Tiles y edificios volumétricos OpenStreetMap.
* **Sistema de Coordenadas Ortogonales ENU (East-North-Up)**: Transformación bidireccional entre coordenadas geocéntricas WGS84 (ECEF) y marcos tangenciales locales en cubierta.
* **Iluminación Atmosférica y Posición del Sol**: Modelo de cielo HDR, dispersión Rayleigh/Mie y vector de luz solar sincronizado con fecha y hora local del usuario.

### 2.2. Definición Geométrica de Faldones y Planos de Trabajo
* **Definición de Plano en 3 Puntos ($P_1, P_2, P_3$)**: Cálculo de la normal de cubierta, pendiente real ($\beta$) y acimut geográfico ($\gamma$) a partir de 3 clics con snapping magnético.
* **Tríada Tridimensional CAD Dinámica**: Cursor con guías ortonormales en tiempo real para desplazamiento milimétrico de vértices en los ejes $U$ (paralelo a cumbrera), $V$ (inclinación) y $N$ (normal).
* **Snapping Magnético con Histéresis**: Captura a vértices existentes con radio de enganche de $16\,\text{px}$ y radio de liberación de $28\,\text{px}$ para evitar vibraciones o saltos indeseados.
* **Soporte Multi-Faldón**: Gestión simultánea de múltiples cubiertas independientes (`WP.polylines`), faldones a 2 y 4 aguas con cálculo individualizado.

### 2.3. Catálogo y Proyección 3D de Obstáculos
* **Volúmenes Paramétricos y Árboles**: Inserción de chimeneas, casetones de ascensor, unidades de climatización (HVAC) y árboles volumétricos con copa elipsoidal ovoide y tronco cilíndrico.
* **Modificadores de Escala y Nudge**: Escalado independiente en ejes $X, Y, Z$ y ajuste fino milimétrico de dimensiones y altura.
* **Proyección Dinámica de Sombras en GPU y Terreno**: Sombras volumétricas proyectadas sobre el modelo del terreno elipsoidal, mallas 3D y cubiertas mediante `ShadowMode.ENABLED` y polígonos analíticos translúcidos.

### 2.4. Generación y Empaquetamiento de Paneles Solares (Grado AAA)
* **Contención Booleana Estricta 2D**: Verificación exhaustiva de 4 vértices, 4 puntos medios, centroide y no-intersección de aristas para impedir paneles en patios interiores o vanos cóncavos.
* **Retranqueo Euclídeo Perpendicular a Aristas**: Margen de seguridad ($\ge 0.35 - 0.50\,\text{m}$) medido punto a segmento contra limatesas, aleros y cumbreras diagonales.
* **Paso Inter-filas 3D de PVsyst con Acimut Oblicuo**: Separación anti-autosombreado calculada para el Solsticio de Invierno (21 de Diciembre) según la inclinación y rumbo solar real.
* **Tipología Este-Oeste en V-Dome ($10^\circ - 15^\circ$)**: Disposición en parejas *Back-to-Back* que incrementa la densidad de potencia instalada entre un $+35\%$ y un $+45\%$.
* **Conmutación Instantánea Vertical ⇄ Horizontal**: Orientación en *Portrait* o *Landscape* con recálculo automático de paso.

### 2.5. Ingeniería Eléctrica, Strings y Conexión
* **Partición Automática de Strings por Ventana MPPT**: Agrupación inteligente de módulos en series homogéneas balanceadas ($N_{\text{string}} \in [8..20]$) para cumplir el límite de $1000\,\text{V DC}$ (IEC 62548).
* **Enrutamiento en Serpiente (*Snake / Leapfrog Routing*)**: Cableado inter-panel alternado por filas para anular el área del bucle inductivo magnético ($\oint \vec{B}\cdot d\vec{A} \approx 0$) conforme a UNE-EN 62305.
* **Segregación Eléctrica Este-Oeste**: Separación de faldones matutinos (`S1-E`) y vespertinos (`S1-W`) para evitar pérdidas por estrangulamiento de corriente ($I_{\text{mp}}$ *mismatch*).
* **Terminales (+) y (-) 3D**: Identificación visual del inicio (verde) y fin (rojo) de cada string.

### 2.6. Simulación Anual de Irradiancia, Mapa de Calor y MLPE
* **Cálculo Asíncrono no Bloqueante con HUD Glassmorphism**: Simulación anual completa en 192 instantes horarios (12 meses $\times$ 16 horas) dividida en micro-tareas asíncronas con barra de progreso a 60 FPS.
* **Física Vectorial Real y Ray-Tracing 3D**: Integración radiativa en el plano del módulo ($\cos\theta_i = \vec{s} \cdot \vec{n}_{\text{panel}}$) con su propia inclinación $\beta$ y acimut $\gamma$, trazado de rayos (`pickFromRay`) con filtro de despegue $\delta = 0.35\,\text{m}$ contra fotogrametría 3D y obstáculos locales.
* **Mapa de Calor Térmico y Telemetría en 2 Líneas**: Gradiente cromático según energía neta anual generada ($E_{\text{anual}}$ en kWh/año) e impacto relativo de sombras (% sombreado).
* **Inspección Interactiva On-Demand (Zero Clutter)**: Escena visualmente limpia con tooltip contextual al pasar el ratón (*hover*): kWh/año, % sombra, $\beta/\gamma$ y diagnóstico MLPE (optimizador/microinversor). Toggle opcional para visualización simultánea de todas las etiquetas.

### 2.7. Balances Energéticos, Economía y Persistencia
* **Producción Anual Neta (kWh/año)**: Integración de irradiancia POA, rendimiento de inversor, factor de suciedad y coeficiente térmico de potencia.
* **Ahorro Económico y Retorno de Inversión (Payback)**: Basado en precio de la energía, tasa de autoconsumo y costes CAPEX/OPEX.
* **Balance Medioambiental**: Toneladas de $\text{CO}_2$ evitadas al año ($0.25\,\text{kg CO}_2/\text{kWh}$).
* **Sistema de Guardado y Carga de Proyectos `.raproject`**: Serialización JSON completa de planos, polilíneas, obstáculos, parámetros y persistencia automática en `localStorage`.

---

## 3. 🏭 FUNDAMENTOS DE INGENIERÍA Y FUNCIONAMIENTO REAL EN INDUSTRIA

En la ingeniería fotovoltaica profesional, el diseño de una instalación sobre cubierta no consiste únicamente en rellenar un tejado con paneles, sino en optimizar un compromiso multidimensional entre **mecánica estructural, física solar, electrotecnia y seguridad normativa**.

```
                         [ LEVANTAMIENTO TOPOGRÁFICO 3D ]
                                        │
                                        ▼
             ┌─────────────────────────────────────────────────────┐
             │       ANÁLISIS ESTRUCTURAL Y RETRANQUEOS            │
             │  • Retranqueo alero: Evacuación pluvial (CTE DB-HS1)│
             │  • Retranqueo cumbrera: Succión viento (Eurocódigo) │
             │  • Pasillos bomberos: Despeje 0.80m (CTE DB-SI)     │
             └─────────────────────────────────────────────────────┘
                                        │
                                        ▼
             ┌─────────────────────────────────────────────────────┐
             │          GENERACIÓN Y EMPAQUETAMIENTO               │
             │  • Coplanar: Máxima potencia sobre tejado inclinado │
             │  • Tilted Sur: Máximo kWh/kWp (cubiertas planas)    │
             │  • Este-Oeste: Máxima potencia kWp/m² y autoconsumo │
             └─────────────────────────────────────────────────────┘
                                        │
                                        ▼
             ┌─────────────────────────────────────────────────────┐
             │         DISEÑO ELÉCTRICO Y DE STRINGS               │
             │  • Ventana MPPT: Voc(-10°C) <= 1000V DC             │
             │  • Snake Routing: Bucle inductivo cero (UNE-EN 62305│
             │  • Segregación E-W: Cero desajuste de corriente     │
             └─────────────────────────────────────────────────────┘
                                        │
                                        ▼
             ┌─────────────────────────────────────────────────────┐
             │         SIMULACIÓN ANUAL Y DIAGNÓSTICO MLPE         │
             │  • Ray-Tracing 3D: Sombras de chimeneas y entorno   │
             │  • Pérdidas CTE DB-HE5 (<3% óptimo, >25% crítico)   │
             │  • Selección de Inversor String vs MLPE Optimizers  │
             └─────────────────────────────────────────────────────┘
```

---

## 4. 📐 FORMULACIÓN FÍSICO-MATEMÁTICA Y MODELOS DE CÁLCULO

### 4.1. Geometría Celeste y Trayectoria Solar

#### A. Declinación Solar ($\delta$) — Fórmula de Cooper / Spencer
$$\delta = 23.45^\circ \cdot \sin\left(\frac{360^\circ}{365} \cdot (284 + n)\right)$$
*(donde $n \in [1..365]$ es el día juliano del año).*

#### B. Ecuación del Tiempo ($EoT$) y Hora Solar Verdadera ($AST$)
$$B = \frac{360^\circ}{365} \cdot (n - 81)$$
$$EoT = 9.87 \sin(2B) - 7.53 \cos(B) - 1.5 \sin(B) \quad [\text{min}]$$
$$AST = LST + \frac{4 \cdot (\text{Longitud} - L_{\text{meridiano}})}{60} + \frac{EoT}{60}$$

#### C. Ángulo Horario ($\omega$), Elevación ($\alpha_s$) y Acimut Solar ($\gamma_s$)
$$\omega = 15^\circ \cdot (AST - 12)$$
$$\sin(\alpha_s) = \sin(\phi)\sin(\delta) + \cos(\phi)\cos(\delta)\cos(\omega)$$
$$\cos(\gamma_s) = \frac{\sin(\delta)\cos(\phi) - \cos(\delta)\sin(\phi)\cos(\omega)}{\cos(\alpha_s)}$$
*(donde $\phi$ es la latitud geográfica del emplazamiento).*

---

### 4.2. Modelo de Radiación Solar en el Plano del Módulo ($G_{\text{POA}}$) — Hay-Davies

La irradiancia solar incidente en el plano inclinado del panel ($G_{\text{POA}}$, *Plane of Array*) se descompone en tres magnitudes físicas:

$$G_{\text{POA}} = G_{\text{directa}} + G_{\text{difusa}} + G_{\text{albedo}}$$

$$G_{\text{directa}} = G_{\text{DNI}} \cdot \max(0, \cos\theta_{\text{incidencia}})$$
$$G_{\text{difusa}} = G_{\text{DHI}} \cdot \left[ A_i \cdot \frac{\cos\theta_{\text{incidencia}}}{\sin\alpha_s} + (1 - A_i) \cdot \left(\frac{1 + \cos\beta}{2}\right) \right]$$
$$G_{\text{albedo}} = G_{\text{GHI}} \cdot \rho_{\text{albedo}} \cdot \left(\frac{1 - \cos\beta}{2}\right)$$

* **Índice de Anisotropía**: $A_i = \frac{G_{\text{DNI}}}{G_0}$.
* **Factor de Visión del Cielo (*Sky View Factor*)**: $SVF = \frac{1 + \cos\beta}{2}$.
* **Factor de Visión del Suelo**: $GVF = \frac{1 - \cos\beta}{2}$.
* **Albedo de Cubierta ($\rho$)**: $\approx 0.20$ (teja cerámica/asfáltica) a $0.35$ (lámina blanca reflectante).

---

### 4.3. Modificador del Ángulo de Incidencia (*IAM*) — Modelo ASHRAE
Para ángulos de incidencia oblicuos ($\theta > 50^\circ$), se descuenta la reflexión óptica en el vidrio del módulo:
$$IAM(\theta) = 1 - b_0 \cdot \left(\frac{1}{\cos\theta} - 1\right) \quad (b_0 \approx 0.05)$$

---

### 4.4. Modelo Térmico de Operación de Celda ($T_{\text{cell}}$) — Faiman / King (Sandia)
La eficiencia de conversión disminuye a medida que la célula se calienta:
$$T_{\text{cell}} = T_{\text{ambiente}} + \left(\frac{\text{NOCT} - 20^\circ\text{C}}{800\,\text{W/m}^2}\right) \cdot G_{\text{POA}}$$
$$\text{Factor de Derating Térmico} = 1.0 + \gamma_{\text{Pmp}} \cdot (T_{\text{cell}} - 25^\circ\text{C})$$
*(con $\text{NOCT} = 45^\circ\text{C}$ y coeficiente de temperatura de potencia $\gamma_{\text{Pmp}} = -0.35\%/^\circ\text{C} = -0.0035\,\text{K}^{-1}$).*

---

### 4.5. Paso Inter-filas 3D en Cubiertas Planas — Ecuación de Mermoud / PVsyst
Para estructuras inclinadas al Sur con acimut arbitrario en el momento crítico del Solsticio de Invierno ($21$ Dic a las 10:00 h solar):

$$H_{\text{vert}} = L_{\text{módulo}} \cdot \sin(\Delta\beta)$$
$$d_{\text{sombra}} = H_{\text{vert}} \cdot \frac{\max(\cos(\gamma_{\text{módulo}} - \gamma_{\text{sol}}), 0.35)}{\tan(\alpha_{\text{sol,10h}})}$$
$$d_{\text{pitch}} = \frac{L_{\text{módulo}} \cdot \cos(\Delta\beta) + d_{\text{sombra}} + \text{Margen}}{\cos(\text{pendiente})}$$

---

### 4.6. Integración Anual de Pérdidas por Sombras ($L_{\text{anual}}$) — CTE DB-HE5
$$L_{\text{anual}}(p_i) = \frac{\sum_{m=1}^{12} \sum_{h=7}^{19} S(p_i, m, h) \cdot G_{\text{POA}}(m, h) \cdot \Delta t}{\sum_{m=1}^{12} \sum_{h=7}^{19} G_{\text{POA}}(m, h) \cdot \Delta t} \times 100\,\%$$
$$\text{Rendimiento Anual Efectivo } \eta_{\text{solar}}(p_i) = 100\,\% - L_{\text{anual}}(p_i)$$

---

### 4.7. Caída de Tensión DC en Cableado de Strings — REBT ITC-BT-40
$$\Delta V_{\text{dc}} = \frac{2 \cdot L_{\text{cable}} \cdot I_{\text{mp}}}{\sigma_{\text{Cu}} \cdot S_{\text{cable}}} \quad [\text{V}]$$
$$\Delta V_{\text{dc}}\,\% = \left(\frac{\Delta V_{\text{dc}}}{N_{\text{módulos}} \cdot V_{\text{mp}}}\right) \times 100 \le 1.5\,\%$$
*(donde $\sigma_{\text{Cu}} = 44\,\text{m}/(\Omega\cdot\text{mm}^2)$ a temperatura de trabajo de $70^\circ\text{C}$).*

---

## 5. 💻 ALGORITMOS Y ARQUITECTURA TECNOLÓGICA DEL MOTOR

### 5.1. Stack Tecnológico Principal
* **CesiumJS (1.114+)**: Motor geoespacial 3D WebGL con soporte nativo para 3D Tiles 1.1, elipsoide WGS84, sombras GPU (`ShadowMap`) y transformaciones geodésicas.
* **Three.js**: Utilidades de álgebra lineal, cuaterniones, matrices $4\times 4$ y proyección vectorial.
* **JavaScript ES2022+ Asíncrono**: Arquitectura orientada a eventos, promesas y procesamiento por lotes (*Event Loop Chunking*).
* **HTML5 Canvas / CSS3 Glassmorphism**: Interfaz HUD de alto contraste con aceleración por hardware (`backdrop-filter: blur(20px)`).

---

### 5.2. Algoritmo de Contención Booleana 2D Estricta (`isPanelFullyContainedInPolygon2D`)
Para certificar que un panel no invade patios o huecos en cubiertas cóncavas:
1. **Ray-Casting Point-in-Polygon (Jordan Curve Theorem)**: Comprueba que los 4 vértices $C_1, C_2, C_3, C_4$ están en el interior del polígono.
2. **Puntos Medios de Aristas**: Comprueba que los puntos $M_i = \frac{C_i + C_{i+1}}{2}$ están en el interior.
3. **Centroide del Panel**: Comprueba que el baricentro está en el interior.
4. **Intersección de Segmentos 2D (Orientation Test)**: Verifica que ninguna de las 4 aristas del panel corta ninguna de las $N$ aristas perimetrales de la cubierta.
5. **Distancia Euclídea a Aristas**: Calcula la distancia punto-segmento:
   $$\text{dist}(P, \overline{AB}) = \| P - (A + t \cdot \vec{AB}) \| \quad \text{con } t = \text{clamp}\left(\frac{\vec{AP} \cdot \vec{AB}}{\|\vec{AB}\|^2}, 0, 1\right)$$
   Garantiza que la distancia mínima a cualquier arista es $\ge \text{setback}$.

---

### 5.3. Algoritmo de Enrutamiento de Strings en Serpiente (`generateSnakeWiringPositions`)
1. **Clustering por Filas**: Agrupa los módulos en filas según su coordenada longitudinal $V$ con tolerancia $\Delta V \le 0.45 \cdot H_{\text{panel}}$.
2. **Ordenación Alternada (Snake / Meander)**:
   * Si la fila es par: Ordena los módulos de izquierda a derecha ($U_{\text{ascendente}}$).
   * Si la fila es impar: Ordena los módulos de derecha a izquierda ($U_{\text{descendente}}$).
3. **Minimización de Bucle**: Traza la polilínea continua inter-módulo e inserta el conductor de retorno paralelo a la bandeja portacables, reduciendo la inductancia mutua a cero según UNE-EN 62305.

---

### 5.4. Algoritmo de Partición MPPT de Strings (`partitionPanelsIntoMPPTStrings`)
1. **Cálculo de Tensión Máxima de Serie**:
   $$V_{\text{string,max}} = N_{\text{mods}} \cdot V_{\text{oc}}(-10^\circ\text{C})$$
2. **Partición Homogénea Balanceada**:
   $$K_{\text{strings}} = \left\lceil \frac{M_{\text{total}}}{N_{\text{max,string}}} \right\rceil$$
   $$S_{\text{base}} = \left\lfloor \frac{M_{\text{total}}}{K_{\text{strings}}} \right\rfloor, \quad R = M_{\text{total}} \pmod{K_{\text{strings}}}$$
   Distribuye los $M_{\text{total}}$ paneles en $K_{\text{strings}}$ grupos de longitud $S_{\text{base}} + 1$ (para los primeros $R$ strings) y $S_{\text{base}}$ para el resto.

---

### 5.5. Arquitectura Asíncrona de Simulación Anual y HUD
Para evitar congelar el hilo de renderizado WebGL (60 FPS):
```javascript
for (let mIdx = 0; mIdx < 12; mIdx++) {
  // 1. Cálculo matemático de las 13 horas solares del mes mIdx
  // 2. Ray-tracing de sombras contra obstáculos y entorno 3D
  // 3. Emisión de progreso al HUD interactivo
  updateSolarCalcHUD(progressPct, mIdx, totalPanelsCount);
  
  // 4. Liberación del Event Loop al navegador
  await new Promise(resolve => setTimeout(resolve, 0));
}
```

---

## 6. 📜 NORMATIVA TÉCNICA Y ESTÁNDARES INTERNACIONALES

| Código Normativo | Título de la Norma | Ámbito de Aplicación en RA |
| :--- | :--- | :--- |
| **CTE DB-HE5** | Código Técnico de la Edificación: Ahorro de Energía (Generación Solar FV) | Integración horaria anual, cálculo de pérdidas por sombra y umbrales de aprovechamiento energético. |
| **CTE DB-SE-AE / Eurocódigo 1** | Seguridad Estructural: Acciones en la Edificación (Viento) | Retranqueos perimetrales de seguridad en aleros y cumbreras para mitigar vórtices de succión de viento. |
| **REBT ITC-BT-40** | Reglamento Electrotécnico de Baja Tensión: Instalaciones Generadoras | Verificación de caída de tensión DC ($\le 1.5\%$) y dimensionamiento de conductores de cobre/aluminio. |
| **IEC 62548** | *Photovoltaic (PV) arrays - Design requirements* | Ventana de tensión MPPT ($V_{\text{oc}} \le 1000\,\text{V}$), balance de strings y segregación Este-Oeste. |
| **UNE-EN 62305** | Protección contra el rayo: Riesgo e impacto electromagnético | Trazado de strings en serpiente (*Snake Routing*) para anulación de bucle inductivo. |
| **IEC 61724-1** | *Photovoltaic system performance monitoring* | Modelos de transposición de irradiancia, cálculo de Performance Ratio ($PR$) y degradación térmica de celda. |

---

## 7. ⚡ INFRAESTRUCTURA ELÉCTRICA, CANALIZACIONES 3D Y MANUAL DE USO DE CABLEADO

### 7.1. Fundamentos en la Industria Real (IRL) vs Gemelo Digital AAA

En una instalación fotovoltaica real bajo normativas **REBT ITC-BT-40**, **UNE-EN 62305** e **IEC 62548**, los conductores eléctricos jamás van suspendidos por el aire formando catenarias:

1. **Bandejas y Conducciones Rígidas en Cubierta**:
   - Los cables solares de corriente continua (tipo ZZ-F / H1Z2Z2-K 1x4 mm² / 1x6 mm² con aislamiento de 1500V) discurren confinados en **bandejas portacables perforadas / rejilla metálica (tipo Rejiband / Pemsa)** o canaletas de PVC protegidas contra radiación UV.
   - Estas bandejas se fijan a la cubierta sobre soportes a una cota de **35 a 45 cm sobre el plano del tejado**, enrasándose con los carriles de la estructura de soporte de los paneles y librando acumulación de agua pluvial o suciedad.
2. **Trazado Estrictamente Ortogonal (90°)**:
   - Los recorridos avanzan paralelos a las cumbreras/aleros (eje horizontal de la cubierta) o en la línea de máxima pendiente.
   - Al llegar a los límites del faldón, giran en **escuadra a 90°** hacia los pasamuros o bajantes de fachada.
3. **Bajantes Verticales por Fachada**:
   - El descenso hacia la sala técnica o inversor se efectúa mediante **tubos rígidos blindados de PVC o acero galvanizado** (M25 / M32) fijados al paramento vertical en ángulo recto.
4. **Interconexiones entre Equipos y Evacuación AC**:
   - Del inversor hacia el cuadro de protecciones de alterna y el contador de red, el cable de evacuación (RV-K o RZ1-K 0.6/1kV) discurre igualmente por tubo rígido vertical y horizontal con quiebros a 90°.

```
[Strings FV en Cubierta] ──(90° sobre faldón +0.35/+0.45m)──► [Bandeja Alero]
                                                                     │
                                                                  (90° Bajante)
                                                                     ▼
[Contador Red / CGMP] <──(90° Tubo AC)── [Cuadro AC] <──(90°)── [Inversor]
```

---

### 7.2. Tipologías Eléctricas de Conexionado Soportadas

El simulador contempla las tipologías habituales de diseño fotovoltaico:

* **Topología 1: Serie Pura (1 String ➔ 1 Canal MPPT)**:
  - Cada serie de paneles cuenta con su propio par de acometidas independientes: polo positivo (+) a cota $+0.35\,\text{m}$ (rojo) y polo negativo (-) a cota $+0.45\,\text{m}$ (azul).
  - Ambos conductores discurren en paralelo para cancelar bucles inductivos magnéticos conforme a UNE-EN 62305.

* **Topología 2: Strings en Paralelo en Cubierta con Conectores en Y (2S)**:
  - Cuando dos strings con idéntica orientación e inclinación comparten una sola entrada MPPT de alta corriente.
  - En la realidad, para no duplicar tiradas de cable por la fachada, ambos strings confluyen en cubierta en un par de **ramificadores en Y (conectores MC4)**.
  - Desde el nodo de unión Y parte una **única línea troncal bipolar** de mayor sección hacia el inversor.

* **Topología 3: Cuadro de Agrupación (Combiner Box en Cubierta)**:
  - Típica en instalaciones comerciales o industriales con $\ge 3$ strings.
  - Los strings individuales llegan a la Combiner Box (dotada de fusibles de string gPV y descargador de sobretensiones transitorias).
  - De la caja parte una línea troncal de gran sección (verde esmeralda `#10B981`) a 90° hacia el inversor.

* **Topología 4: Línea de Evacuación AC**:
  - Trazado de tubo rígido en fachada entre el Inversor y el Contador de Red / CGMP con quiebros a 90° (celeste `#38BDF8`).

---

### 7.3. Formulación del Motor Manhattan 3D y Sombras Físicas

1. **Descomposición en Ejes Locales del Faldón ($\vec{U}, \vec{V}, \vec{N}$)**:
   A partir de la tríada CAD del plano de trabajo (`working-plane.js`), cualquier trayectoria se descompone en:
   $$\vec{P}(t) = \vec{P}_{\text{inicio}} + h_{\text{offset}} \cdot \vec{N} + \Delta u \cdot \vec{U} + \Delta v \cdot \vec{V} + \Delta z \cdot \vec{k}$$
   - $h_{\text{offset}} = +0.35\,\text{m}$ (DC+) o $+0.45\,\text{m}$ (DC- / bandeja).
   - $\Delta u = (\vec{P}_{\text{fin}} - \vec{P}_{\text{inicio}}) \cdot \vec{U}$ (avance en hilera).
   - $\Delta v = (\vec{P}_{\text{fin}} - \vec{P}_{\text{inicio}}) \cdot \vec{V}$ (quiebro a alero).
   - $\Delta z$: descenso vertical a 90° por fachada.

2. **Geometría 3D Volumétrica con Proyección de Sombras**:
   - Se emplea `Cesium.PolylineVolumeGraphics` con perfiles cilíndricos ($r = 1.8\,\text{cm}$) o prismáticos en U ($8 \times 3\,\text{cm}$).
   - Con la propiedad `shadows: Cesium.ShadowMode.ENABLED`, Cesium genera mallas triangulares completas que proyectan sombras reales en el `shadowMap` de 4096 px según la posición solar astronómica.
   - Colores planos sólidos sin shaders procedurales para garantizar cero errores en WebGL.

---

### 7.4. Manual de Operación y Uso para el Instalador

#### A. Generación Automática Zero-Click
Al entrar en el **Paso 4 (Ingeniería)** o al recolocar equipos (inversor o contador), el sistema genera **automáticamente** el trazado ortogonal completo a 90° sin necesidad de hacer clics manuales.

#### B. Barra Lateral: Herramientas de Canalización
* **🔴 TRAZAR BANDEJA DC**: Activa el modo para dibujar una ruta personalizada de bandeja en cubierta y fachada.
  - **Snapping Magnético**: El primer clic se imanta automáticamente a los terminales (+) o (-) del string más próximo o al nodo Y.
  - **Vértices Interactivos**: Cada clic crea un codo a 90°.
* **🔵 TRAZAR TUBO AC**: Permite dibujar la canalización de alterna desde el inversor hasta el contador.
* **Barra Flotante de Trazado**:
  - **✔ (OK / Terminar)**: Guarda la ruta y recalcula la sección y caída de tensión.
  - **↺ (Deshacer punto)**: Elimina el último codo marcado.
  - **❌ (Cancelar)**: Descarta el dibujo y restaura la ruta ortogonal automática.

#### C. Telemetría y Dimensionamiento en Tiempo Real
El panel lateral actualiza instantáneamente:
* **Longitud Medida ($L_{\text{dc}}$ y $L_{\text{ac}}$)** en metros exactos de recorrido ortogonal.
* **Sección Recomendada ($S_{\text{dc}}$ y $S_{\text{ac}}$)** en mm² cumpliendo límite de caída de tensión $\Delta V \le 1.5\%$ (REBT ITC-BT-40).
* **Impacto en Pérdidas Óhmicas (PR)** transmitido automáticamente al motor de producción solar.