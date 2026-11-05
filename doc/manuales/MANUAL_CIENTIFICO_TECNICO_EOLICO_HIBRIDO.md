# 📚 MANUAL CIENTÍFICO-TÉCNICO, FUNDAMENTOS MATEMÁTICOS Y GUÍA DE INGENIERÍA: MÓDULO EÓLICO E HÍBRIDO (RA-WIND)
**Simulación Aeroelástica, Propagación Acústica ISO 9613-2, Micro-CFD de Cubierta y Despacho Híbrido 8760 h**  
*Documento de Referencia Científica, Marco Normativo Español y Manual de Usuario para Ingeniería*  
*Versión: 1.0-AAA Scientific Grade*  
*Fecha: Octubre 2026*  
*Autor: Área de Aerodinámica, Dinámica de Estructuras e Ingeniería Eléctrica RA*

---

## 📑 ÍNDICE GENERAL

1. [Visión General y Justificación de la Hibridación Eólico-Solar](#1-visión-general-y-justificación-de-la-hibridación-eólico-solar)
2. [Catálogo Exhaustivo de Funcionalidades Científico-Técnicas](#2-catálogo-exhaustivo-de-funcionalidades-científico-técnicas)
3. [Formulación Físico-Matemática Completa](#3-formulación-físico-matemática-completa)
   * 3.1. Aerodinámica del Rotor y Corrección por Densidad Atmosférica
   * 3.2. Modelo Estadístico del Recurso Eólico (Weibull y Perfil de Cizalladura)
   * 3.3. Micro-CFD Analítico en Cubierta (Burbuja de Separación y Speed-Up)
   * 3.4. Modelado Analítico de Estelas (Wake Deficit: Jensen y Bastankhah Gaussiano)
   * 3.5. Aeroacústica y Propagación del Ruido Ambiental (ISO 9613-2)
   * 3.6. Astronomía Óptica de Sombras Cruzadas y Parpadeo (Shadow Flicker)
   * 3.7. Dinámica Estructural, Esfuerzos al Viento (CTE) y Resonancia 1P/3P
   * 3.8. Ingeniería Eléctrica: Rectificación, Freno Reostático y Caída de Tensión
   * 3.9. Despacho Híbrido 8760 h, Peak Shaving Tarifario y LCOE
4. [Marco Regulatorio y Normativa Técnica Aplicable en España](#4-marco-regulatorio-y-normativa-técnica-aplicable-en-españa)
5. [Manual de Usuario y Guía Operativa para el Ingeniero/Instalador](#5-manual-de-usuario-y-guía-operativa-para-el-ingenieroinstalador)
   * 5.1. Guía Paso a Paso en los 5 Pasos Canónicos
   * 5.2. Justificación Técnica de Parámetros y Buenas Prácticas
6. [Referencias Bibliográficas y Fuentes Científicas](#6-referencias-bibliográficas-y-fuentes-científicas)

---

## 1. VISIÓN GENERAL Y JUSTIFICACIÓN DE LA HIBRIDACIÓN EÓLICO-SOLAR

La transición hacia sistemas de generación distribuida en polígonos industriales y cubiertas comerciales (Autoconsumo C&I) encuentra en la **hibridación eólico-solar** su máxima expresión de eficiencia tecno-económica. 

Mientras que la radiación solar fotovoltaica exhibe una marcada estacionalidad estival y una ventana diurna rígida limitada a un promedio de 4 a 6 horas pico diarias, **el recurso eólico presenta una correlación temporal altamente complementaria**:
* **Complementariedad Intradiaria:** En la península ibérica, las brisas térmicas y los vientos superficiales intensifican su velocidad durante el atardecer, la noche y las primeras horas de la madrugada, cuando la producción fotovoltaica es nula.
* **Complementariedad Estacional:** El invierno y los periodos de borrascas atlánticas registran los máximos factores de planta eólicos, compensando la caída drástica de irradiación solar provocada por la nubosidad y los bajos ángulos solares.
* **Optimización de Infraestructuras y Punto de Conexión (PdC):** Bajo el marco del **RD 244/2019**, ambas tecnologías evacúan a través del mismo transformador y acometida eléctrica, elevando el factor de capacidad de la conexión a red desde un $18\%-22\%$ (solar pura) hasta valores superiores al $40\%-55\%$ (planta híbrida), minimizando las inversiones en refuerzos de red y maximizando el autoconsumo directo.

---

## 2. CATÁLOGO EXHAUSTIVO DE FUNCIONALIDADES CIENTÍFICO-TÉCNICAS

El módulo `RA-Wind` implementa un ecosistema de herramientas de cálculo de precisión industrial:

1. **Evaluación Multifuente del Recurso Eólico:** Ingesta y tratamiento de distribuciones estadísticas de Weibull bivariadas por sectores, conexión remota vía API con modelos de reanálisis atmosférico (**Global Wind Atlas / ERA5**) y parseo nativo de registros horarios anemométricos locales (`.tim`, `.tab`, `.csv`).
2. **Micro-Siting Aerodinámico en Cubierta (Micro-CFD Analítico):** Determinación analítica de la capa límite sobre edificios industriales, resolviendo la **burbuja de recirculación y separación de flujo** en la arista de barlovento y localizando con exactitud milimétrica la zona de aceleración de flujo (*speed-up*).
3. **Modelado Analítico de Estelas Bidimensional y Tridimensional:** Cálculo del déficit de velocidad del viento y turbulencia añadida aguas abajo de los aerogeneradores mediante los modelos de **Jensen-Park** y el **modelo Gaussiano autosemejante de Bastankhah & Porté-Agel**.
4. **Simulación Astronómica de Sombras Cruzadas e Interferencia Fotovoltaica:** Proyección analítica en tiempo real de la sombra de la torre y del parpadeo estroboscópico del rotor sobre los módulos solares modelados en RA, evaluando la pérdida de producción por *mismatch* en los strings.
5. **Aeroacústica Computacional según Norma ISO 9613-2:** Modelo de propagación acústica punto a punto y cálculo de mallas de presión sonora con atenuación geométrica, absorción atmosférica en 8 bandas de octava y efecto del suelo, generando isolíneas de cumplimiento con la **Ley 37/2003 del Ruido** y el **RD 1367/2007**.
6. **Calendario Anual de Parpadeo de Sombras a Receptores Sensibles (*Shadow Flicker*):** Determinación exacta de los días y minutos anuales en los que las palas proyectan sombras intermitentes sobre las ventanas de edificios circundantes, con generación de matriz de paradas automáticas (*Flicker Curtailment*).
7. **Auditoría de Idoneidad del Emplazamiento (Site Suitability IEC 61400-2):** Verificación de compatibilidad de la máquina seleccionada frente a la intensidad de turbulencia ($TI$), ángulo de inclinación de flujo ascendente (*upflow angle*) y velocidad de supervivencia a 50 años ($V_{e50}$).
8. **Análisis Dinámico de Resonancia Estructural en Cubiertas (1P/3P):** Comprobación de interferencia de frecuencias de excitación rotacional y de paso de pala frente a las frecuencias propias de los forjados metálicos o de hormigón de la nave industrial.
9. **Ingeniería Eléctrica y Protecciones REBT (ITC-BT-40):** Dimensionado de conductores de potencia en corriente alterna y continua rectificada, caída de tensión $\le 1{,}5\%$, sistema de frenado reostático (*dump load*) y diseño de puesta a tierra y protección contra el rayo según UNE-EN 62305.
10. **Despacho Energético Horario 8760 h y Optimización Tarifaria:** Simulación temporal del balance entre generación conjunta (solar + eólica), consumo auditado de la nave industrial y almacenamiento en baterías (BESS), maximizando el recorte de picos de potencia (*Peak Shaving*) en tarifas 3.0TD y 6.1TD.
11. **Gemelo Digital Ciberfísico en Tiempo Real (SCADA):** Conexión telemétrica bidireccional vía WebSockets/MQTT con autómatas industriales, sincronizando cinemática 3D, supervisión térmica y diagnóstico de degradación aerodinámica mediante comparación de curva de potencia teórica vs. real.

---

## 3. FORMULACIÓN FÍSICO-MATEMÁTICA COMPLETA

### 3.1. Aerodinámica del Rotor y Corrección por Densidad Atmosférica

#### Potencia Disponible y Límite Teórico de Betz
La potencia cinética total contenida en una columna de aire que atraviesa perpendicularmente el área de barrido del rotor ($A = \pi R^2$) es:
$$P_{\text{viento}} = \frac{1}{2} \rho A v^3$$

Donde:
* $\rho$: Densidad del aire local ($\text{kg/m}^3$).
* $A$: Área de barrido del rotor ($\text{m}^2$).
* $v$: Velocidad no perturbada del viento ($\text{m/s}$).

La potencia mecánica extraída por el rotor está regulada por el coeficiente aerodinámico de potencia $C_p(\lambda, \theta)$:
$$P_{\text{mec}} = \frac{1}{2} \rho A v^3 C_p(\lambda, \theta)$$

Por la **Ley de Betz**, el coeficiente de potencia máximo teórico alcanzable por cualquier turbina eólica en flujo libre es:
$$C_{p,\text{max}} = \frac{16}{27} \approx 0{,}5926 \quad (59{,}26\%)$$

En pequeños aerogeneradores comerciales de alta eficiencia, el $C_p$ real oscila en el rango $0{,}32 \le C_p \le 0{,}44$, en función del número de velocidad específica en punta (*Tip Speed Ratio*, $\lambda$):
$$\lambda = \frac{\omega \cdot R}{v}$$
donde $\omega$ es la velocidad angular del rotor ($\text{rad/s}$) y $R$ el radio de la pala ($\text{m}$).

#### Corrección Barométrica y Térmica de la Densidad del Aire (IEC 61400-12-1)
Las curvas de potencia de catálogo certifican la producción a condiciones estándar internacionales ($\rho_0 = 1{,}225 \text{ kg/m}^3$, a $T_0 = 288{,}15 \text{ K}$ y $P_0 = 1013{,}25 \text{ hPa}$). Para cualquier emplazamiento a altitud $z$ sobre el nivel del mar y temperatura ambiente local $T$ [°C], la densidad real se calcula mediante la ley hipsométrica de los gases ideales:
$$\rho(z, T) = \frac{P_0}{R_{\text{aire}} \cdot (T + 273{,}15)} \cdot \left(1 - \frac{L \cdot z}{T_0}\right)^{\frac{g \cdot M}{R \cdot L}}$$

Donde:
* $R_{\text{aire}} = 287{,}05 \text{ J/(kg}\cdot\text{K)}$ (constante específica del aire seco).
* $g = 9{,}80665 \text{ m/s}^2$ (aceleración gravitatoria).
* $L = 0{,}0065 \text{ K/m}$ (gradiente vertical de temperatura estándar).

La velocidad de viento normalizada equivalente que experimenta el rotor para interpolar en la curva de catálogo es:
$$v_{\text{eq}} = v \cdot \left(\frac{\rho(z, T)}{\rho_0}\right)^{\frac{1}{3}}$$

---

### 3.2. Modelo Estadístico del Recurso Eólico (Weibull y Perfil de Cizalladura)

#### Función de Densidad de Probabilidad de Weibull
La distribución de velocidades de viento horarias a lo largo de un año se modela mediante la función biparamétrica de Weibull:
$$f(v; k, c) = \left(\frac{k}{c}\right) \left(\frac{v}{c}\right)^{k-1} \exp\left(-\left(\frac{v}{c}\right)^k\right)$$

Donde:
* $k$: Factor de forma adimensional (típicamente $1{,}6 \le k \le 2{,}4$ en la península ibérica; valores bajos indican regímenes muy racheados y valores altos vientos estables).
* $c$: Factor de escala ($\text{m/s}$), directamente relacionado con la velocidad media del emplazamiento:
$$\bar{v} = c \cdot \Gamma\left(1 + \frac{1}{k}\right)$$
donde $\Gamma$ representa la función Gamma de Euler.

#### Extrapolación Vertical del Viento: Perfil de Cizalladura (Shear)
Para transferir la velocidad medida por un mástil o estación a la altura real del buje del aerogenerador ($H_{\text{hub}}$):

1. **Ley Exponencial de Hellmann:**
   $$v(H_{\text{hub}}) = v_{\text{ref}} \cdot \left(\frac{H_{\text{hub}}}{z_{\text{ref}}}\right)^\alpha$$
   donde $\alpha$ es el exponente de cizalladura ($\alpha \approx 0{,}14$ en terreno abierto plano; $\alpha \approx 0{,}22-0{,}30$ en entornos industriales con naves).

2. **Perfil Logarítmico de Prandtl-von Kármán (Capa Límite Atmosférica):**
   $$v(H_{\text{hub}}) = v_{\text{ref}} \cdot \frac{\ln\left(\frac{H_{\text{hub}}}{z_0}\right)}{\ln\left(\frac{z_{\text{ref}}}{z_0}\right)}$$
   donde $z_0$ es la longitud de rugosidad aerodinámica del terreno ($z_0 = 0{,}03 \text{ m}$ en campo abierto; $z_0 = 0{,}40-0{,}80 \text{ m}$ en polígonos industriales según la clase de rugosidad de la Unión Europea).

---

### 3.3. Micro-CFD Analítico en Cubierta (Burbuja de Separación y Speed-Up)

El flujo que incide sobre una nave industrial genera una separación de la capa límite en la arista de barlovento debido al gradiente adverso de presión provocado por el cambio geométrico abrupto a $90^\circ$.

```
                    Zona de Aceleración (Speed-Up)  v > v_ref
                             ↑   ↑   ↑
            Capa de cizalladura (Shear Layer)
         . - - - - - - - - - - - - - - - - - - - - - - - .
       /                                                   \
  ___ /        BURBUJA DE RECIRCULACIÓN (Vórtice Turbulento) \
 |   |        ←  ←  ←  (Flujo Inverso y Caótico)              \
 | H |_________________________________________________________| Cubierta
 |   | ←-------------- Longitud Lc ---------------------------→
```

#### Longitud de Escala del Edificio y Envolvente de la Cavidad
Siguiendo los modelos empíricos validados de Wilson (1979) y Peterka et al. (1985):
$$S_c = \min(H, W)^{\frac{2}{3}} \cdot \max(H, W)^{\frac{1}{3}}$$
* Longitud longitudinal de la burbuja de separación: $L_c = 0{,}9 \cdot S_c$
* Altura máxima de la cavidad sobre la arista de cubierta: $H_c = 0{,}22 \cdot S_c$

La altura de la envolvente de la burbuja $y_b$ en función de la distancia de retranqueo desde la arista de barlovento $x$ es:
$$y_b(x) = H_c \cdot \left(1 - \frac{x}{L_c}\right)^2 \quad \text{para } 0 \le x \le L_c$$

#### Factor de Aceleración (*Speed-Up Ratio, $S$*)
Para alturas de buje $z > y_b(x)$, el flujo experimenta una compresión de líneas de corriente que incrementa la velocidad local respecto a la velocidad de aproximación no perturbada:
$$S(x, z) = 1{,}0 + \left(S_{\text{max}}(x) - 1{,}0\right) \cdot \exp\left(-\frac{z - y_b(x)}{0{,}5 \cdot H_c}\right)$$
Donde la aceleración máxima en la arista de barlovento ($x=0$) alcanza valores de $S_{\text{max}} \approx 1{,}20$ a $1{,}35$. Dado que la potencia eólica depende del cubo de la velocidad ($P \propto v^3$), un factor de aceleración de $S = 1{,}25$ produce un incremento de potencia teórica de:
$$\frac{P_{\text{real}}}{P_{\text{ref}}} = (1{,}25)^3 = 1{,}953 \quad (+95{,}3\% \text{ de energía})$$

---

### 3.4. Modelado Analítico de Estelas (Wake Deficit: Jensen y Bastankhah Gaussiano)

#### Modelo Cinemático de Jensen-Park (N.O. Jensen, 1983)
Asume una distribución de velocidad uniforme dentro de un cono de expansión lineal con factor de crecimiento $k_w$:
$$\frac{\Delta v}{v_\infty} = \frac{1 - \sqrt{1 - C_t}}{\left(1 + \frac{2 k_w x}{D}\right)^2}$$

Donde:
* $C_t$: Coeficiente de empuje aerodinámico (*thrust coefficient*) de la turbina barlovento.
* $D$: Diámetro del rotor ($2R$).
* $x$: Distancia longitudinal entre aerogeneradores a lo largo de la dirección del viento.
* $k_w$: Coeficiente de decaimiento de estela ($k_w \approx 0{,}075$ en tierra; $k_w \approx 0{,}10-0{,}12$ en entornos industriales de alta rugosidad).

#### Modelo Gaussiano Autosemejante de Bastankhah & Porté-Agel (2014)
Supera las limitaciones del modelo plano de Jensen al modelar el déficit de velocidad mediante una función gaussiana continua coherente con las ecuaciones de Navier-Stokes promediadas por Reynolds (RANS):
$$\frac{\Delta v(x, y, z)}{v_\infty} = \left(1 - \sqrt{1 - \frac{C_t}{8 \cdot (\sigma_y \sigma_z / D^2)}}\right) \cdot \exp\left(-\frac{1}{2}\left[\left(\frac{y}{\sigma_y}\right)^2 + \left(\frac{z - H_{\text{hub}}}{\sigma_z}\right)^2\right]\right)$$

Donde la dispersión lateral y vertical de la estela se modela según la intensidad de turbulencia ambiente $I_0$:
$$\frac{\sigma_y}{D} = k_y \frac{x}{D} + \epsilon, \quad \frac{\sigma_z}{D} = k_z \frac{x}{D} + \epsilon, \quad \epsilon = 0{,}2 \sqrt{\frac{1 + \sqrt{1 - C_t}}{2 \sqrt{1 - C_t}}}$$

#### Superposición de Múltiples Estelas (Katic et al., 1986)
Para configuraciones con múltiples turbinas alineadas, el déficit total se calcula por la raíz cuadrada de la suma de cuadrados (RSS):
$$\left(\frac{\Delta v_{\text{total}}}{v_\infty}\right)_n = \sqrt{\sum_{i=1}^{n-1} \left(\frac{\Delta v_i}{v_\infty}\right)^2}$$

---

### 3.5. Aeroacústica y Propagación del Ruido Ambiental (ISO 9613-2)

La presión acústica continua equivalente en ponderación A ($L_{\text{AT}}$) recibida en un punto receptor sensible (linderos de parcela o fachadas residenciales) a partir del nivel de potencia sonora garantizado por el fabricante ($L_{\text{WA}}$) se formula según la norma **ISO 9613-2**:
$$L_{\text{AT}} = L_{\text{WA}} + D_c - A$$

Donde:
* $D_c$: Corrección de directividad (para aerogeneradores se toma $D_c = 0 \text{ dB}$ en campo esférico abierto).
* $A$: Atenuación total a lo largo de la trayectoria de propagación:
$$A = A_{\text{div}} + A_{\text{atm}} + A_{\text{gr}} + A_{\text{bar}} + A_{\text{misc}}$$

#### Componentes de Atenuación Normalizada:
1. **Divergencia Geométrica ($A_{\text{div}}$):** Radiación esférica de la onda sonora a distancia euclídea $d$:
   $$A_{\text{div}} = 20 \log_{10}(d) + 11 \quad [\text{dB}]$$
2. **Absorción Atmosférica ($A_{\text{atm}}$):** Disipación por relajación molecular de nitrógeno y oxígeno calculada por bandas de octava según **ISO 9613-1**:
   $$A_{\text{atm}} = \frac{\alpha_f \cdot d}{1000} \quad [\text{dB}]$$
   donde $\alpha_f$ es el coeficiente de absorción en dB/km (ej. a 15 °C y 70% HR: $\alpha_{500\text{Hz}} \approx 1{,}9 \text{ dB/km}$, $\alpha_{1000\text{Hz}} \approx 3{,}7 \text{ dB/km}$, $\alpha_{4000\text{Hz}} \approx 26{,}2 \text{ dB/km}$).
3. **Efecto del Suelo ($A_{\text{gr}}$):** Interferencia entre la onda directa y la reflejada. En pavimentos asfálticos y cubiertas metálicas de polígonos industriales se adopta un factor de absorción de suelo duro ($G = 0$):
   $$A_{\text{gr}} \approx -1{,}5 \text{ dB (refuerzo por reflexión)}$$

---

### 3.6. Astronomía Óptica de Sombras Cruzadas y Parpadeo (Shadow Flicker)

El cálculo del sombreado estroboscópico de las palas sobre receptores vecinos y mesas solares se basa en el vector unitario de posición solar local $\vec{s}(t) = [\cos\alpha\sin\gamma, \cos\alpha\cos\gamma, \sin\alpha]^T$ derivado del modelo de **Spencer / Michalsky**.

La proyección geométrica de cualquier punto de la pala $\vec{P}_{\text{pala}}(t)$ sobre el plano de una cubierta o fachada receptora definido por su punto base $\vec{P}_0$ y su vector normal $\vec{n}$ es:
$$\vec{P}_{\text{sombra}}(t) = \vec{P}_{\text{pala}}(t) - \left(\frac{(\vec{P}_{\text{pala}}(t) - \vec{P}_0) \cdot \vec{n}}{\vec{s}(t) \cdot \vec{n}}\right) \cdot \vec{s}(t)$$

#### Criterio Astronómico de Parpadeo
Existe parpadeo de sombra en un receptor si se cumplen simultáneamente cuatro condiciones astronómicas:
1. La altura solar sobre el horizonte supera el umbral de deslumbramiento mínimo ($\alpha > 3^\circ$).
2. La línea de mira sol-receptor intersecta el disco de barrido del rotor: $\text{distancia}(\vec{P}_{\text{eje}}, \text{Rayo}) \le R$.
3. La radiación directa normal supera el umbral de proyección de sombra nítida ($DNI \ge 120 \text{ W/m}^2$).
4. El ángulo de incidencia solar en la ventana o receptor satisface: $\cos\theta_{\text{incidencia}} > 0$.

---

### 3.7. Dinámica Estructural, Esfuerzos al Viento (CTE) y Resonancia 1P/3P

#### Empuje Aerodinámico Máximo y Momento de Vuelco en Base
La fuerza de arrastre axial total (*thrust*) ejercida por el viento sobre el rotor a la velocidad extrema de diseño según el **CTE DB-SE-AE** es:
$$F_{\text{thrust}} = \frac{1}{2} \rho A v_{\text{extrema}}^2 C_t$$
El momento volcador en la cimentación o anclaje de cubierta para una altura de buje $H_{\text{hub}}$ es:
$$M_{\text{vuelco}} = F_{\text{thrust}} \cdot H_{\text{hub}} + F_{\text{viento,torre}} \cdot \frac{H_{\text{hub}}}{2}$$

#### Espectro de Frecuencias de Excitación Cíclica (1P / 3P)
Las palas en rotación inducen fuerzas armónicas periódicas sobre la estructura de soporte:
* **Frecuencia 1P (Desbalanceo del rotor):** Generada por asimetrías de masa o pitch entre palas:
  $$f_{1P} = \frac{\text{RPM}}{60} \quad [\text{Hz}]$$
* **Frecuencia 3P (Paso de pala en rotores tripala):** Generada por el corte periódico de la pala a través del gradiente vertical de viento y la sombra aerodinámica del fuste:
  $$f_{3P} = 3 \cdot f_{1P} = \frac{3 \cdot \text{RPM}}{60} \quad [\text{Hz}]$$

Para evitar el fenómeno catastrófico de **resonancia elasto-dinámica**, la frecuencia natural del forjado o torre ($f_0$) debe guardar un margen de seguridad de al menos un $\pm 15\%$ respecto a los armónicos de excitación:
$$\frac{f_0}{f_{1P}} \notin [0{,}85 \dots 1{,}15] \quad \land \quad \frac{f_0}{f_{3P}} \notin [0{,}85 \dots 1{,}15]$$

---

### 3.8. Ingeniería Eléctrica: Rectificación, Freno Reostático y Caída de Tensión

#### Generador Síncrono de Imanes Permanentes (PMSG) y Rectificación
La tensión inducida de línea de un PMSG trifásico varía linealmente con la velocidad de giro: $V_{\text{AC}}(t) = k_e \cdot \omega(t)$. La tensión continua de salida tras un puente rectificador trifásico de diodos de 6 pulsos es:
$$V_{\text{DC}} = \frac{3\sqrt{2}}{\pi} V_{\text{LL,rms}} \approx 1{,}35 \cdot V_{\text{LL,rms}}$$

#### Dimensionado de la Resistencia de Frenado (*Dump Load*)
La resistencia óhmica necesaria para disipar la potencia de parada de emergencia $P_{\text{freno}}$ a la tensión de desconexión del bus DC ($V_{\text{DC,max}}$) se calcula por la ley de Joule:
$$R_{\text{dump}} = \frac{V_{\text{DC,max}}^2}{P_{\text{freno}}}$$
Donde la capacidad térmica del banco reostático debe dimensionarse para absorber el frenado cinemático sin rebasar su temperatura de seguridad ($< 350 \text{ °C}$):
$$E_{\text{freno}} = \frac{1}{2} J_{\text{rotor}} \omega_{\text{max}}^2 + \int_0^{t_{\text{parada}}} P_{\text{aero}}(t) \, dt$$

#### Caída de Tensión en Corriente Alterna Trifásica (REBT ITC-BT-40)
La caída de tensión porcentual ($\Delta U_{\%}$) a lo largo de una línea de cobre o aluminio de longitud $L$ y sección $S$:
$$\Delta U_{\%} = \frac{\sqrt{3} \cdot I \cdot L \cdot (\cos\varphi + \frac{X}{R}\sin\varphi)}{\kappa \cdot S \cdot V_n} \cdot 100 \le 1{,}5\%$$
donde $\kappa$ es la conductividad térmica del conductor a $90 \text{ °C}$ ($\kappa_{\text{Cu}} = 44 \text{ m}/(\Omega\cdot\text{mm}^2)$) y $X$ la reactancia inductiva kilométrica.

---

### 3.9. Despacho Híbrido 8760 h, Peak Shaving Tarifario y LCOE

#### Ecuación de Balance de Potencia Horaria
Para cada instante $t \in [1 \dots 8760]$ horas del año:
$$P_{\text{gen}}(t) = P_{\text{solar}}(t) + P_{\text{wind}}(t)$$
$$P_{\text{autoconsumo}}(t) = \min\left(P_{\text{demanda}}(t), \, P_{\text{gen}}(t) + P_{\text{bess,descarga}}(t)\right)$$
$$P_{\text{excedente}}(t) = \max\left(0, \, P_{\text{gen}}(t) - P_{\text{demanda}}(t) - P_{\text{bess,carga}}(t)\right)$$
$$P_{\text{exportada}}(t) = \min\left(P_{\text{acceso\_red}}, \, P_{\text{excedente}}(t)\right)$$
$$P_{\text{curtailment}}(t) = P_{\text{excedente}}(t) - P_{\text{exportada}}(t)$$

#### Algoritmo de Peak Shaving de Término de Potencia (Tarifas 3.0TD / 6.1TD)
El coste de la potencia facturada en España penaliza el máximo cuartohorario registrado en cada periodo tarifario $p \in [P1 \dots P6]$:
$$\text{Coste}_{\text{potencia}} = \sum_{p=1}^6 \text{TérminoPotencia}_p \cdot \max_{t \in T_p}\left(P_{\text{red\_importada}}(t)\right)$$
El despacho conjunto despacha la batería BESS y modula la turbina eólica para garantizar que la potencia demandada a la red satisfaga:
$$P_{\text{red\_importada}}(t) \le P_{\text{consigna\_objetivo}}(p)$$
reduciendo el término fijo de la factura en hasta un $25\%-40\%$.

#### Coste Nivelado de la Energía Híbrida (LCOE Híbrido)
$$\text{LCOE}_{\text{híbrido}} = \frac{\sum_{t=0}^N \frac{\text{CAPEX}_t + \text{OPEX}_t}{(1 + r)^t}}{\sum_{t=1}^N \frac{E_{\text{solar,autoconsumida}}(t) + E_{\text{eólica,autoconsumida}}(t) + E_{\text{exportada}}(t)}{(1 + r)^t}} \quad [\text{€/kWh}]$$

---

## 4. MARCO REGULATORIO Y NORMATIVA TÉCNICA APLICABLE EN ESPAÑA

| Cuerpo Normativo | Artículo / Disposición | Exigencia Técnica Aplicada en RA-Wind |
| :--- | :--- | :--- |
| **RD 244/2019** | Marco de Autoconsumo | Define la modalidad de autoconsumo individual o colectivo, con o sin excedentes, y regula la inyección compartida de instalaciones de generación híbridas en un mismo punto de suministro. |
| **REBT ITC-BT-40** | Generadores en BT | Exige que la caída de tensión entre el generador y el punto de interconexión sea $\le 1{,}5\%$. Obliga a instalar protección de corte automático por fallo de red (*anti-isla*). |
| **REBT ITC-BT-18** | Puestas a Tierra | Interconexión obligatoria de la tierra de la torre eólica con la red de tierra general del edificio, logrando una resistencia de difusión $R \le 10 \, \Omega$. |
| **REBT ITC-BT-23** | Sobretensiones | Prescripción obligatoria de descargadores de sobretensión transitoria tipo 1+2 en la cabecera de la línea eólica por exposición directa al rayo. |
| **CTE DB-SE-AE** | Seguridad Estructural (Viento) | Coeficientes de presión eólica sobre cubiertas industriales y cálculo de empuje estático y dinámico a la velocidad de referencia zonal ($v_b = 26-29 \text{ m/s}$). |
| **CTE DB-HR** | Protección frente al Ruido | Aislamiento acústico aéreo y estructural de la envolvente de la edificación frente a vibraciones generadas por la maquinaria en cubierta. |
| **Ley 37/2003 & RD 1367/2007** | Zonificación Acústica | Límites máximos de inmisión en colindantes: Suelo industrial ($65 \text{ dBA}$ día, $55 \text{ dBA}$ noche); Suelo residencial contiguo ($55 \text{ dBA}$ día, $45 \text{ dBA}$ noche). |
| **RD 369/2023 (AESA)** | Servidumbres Aeronáuticas | Obligación de solicitar autorización de la Agencia Estatal de Seguridad Aérea si la altura de punta de pala supera las superficies limitadoras de obstáculos o rebasa $100 \text{ m}$. |
| **IEC 61400-2:2014** | Pequeños Aerogeneradores | Define los límites de diseño estructural para turbinas de área de barrido $< 200 \text{ m}^2$ (vientos extremos, fatiga y clases I a S). |

---

## 5. MANUAL DE USUARIO Y GUÍA OPERATIVA PARA EL INGENIERO/INSTALADOR

### 5.1. Guía Paso a Paso en los 5 Pasos Canónicos

#### Paso 1: EMPLAZAMIENTO — Cimentación y Verificación de ZVI
1. **Definir la ubicación de la turbina:** Seleccione la herramienta `Anclaje Eólico`.
   * Si la implantación es **en suelo**: Haga clic sobre la parcela exterior. RA trazará la zapata prismática normalizada de hormigón armado ($V \approx 4-8 \text{ m}^3$).
   * Si es **en cubierta industrial**: Active el modo `Snapping Estructural` y sitúe la turbina sobre un nudo viga-pilar de la nave. RA generará una bancada metálica de reparto en doble viga IPN.
2. **Verificar Visibilidad Paisajística:** Pulse la tecla `V` para activar el shader de **Cuenca Visual (ZVI 3D)**. El terreno circundante se teñirá de rojo en las zonas donde la turbina sea visible, facilitando el informe de impacto ambiental y licencias municipales.

#### Paso 2: GENERACIÓN — Selección de Máquina y Micro-Siting
1. Abra la pestaña lateral **💨 Eólica**.
2. **Seleccionar Aerogenerador del Catálogo:** Escoja el fabricante y modelo (ej. Bornay Wind 25.3 o Enair 70PRO) y seleccione la altura de torre deseada ($12, 18 \text{ ó } 24 \text{ m}$).
3. **Comprobar el Radio de Seguridad:** RA mostrará en escena un círculo continuo con el radio de caída estricto ($1{,}10 \times H_{\text{punta}}$). Asegúrese de que el círculo no invada parcelas públicas ni linderos no autorizados.

#### Paso 3: RECURSO & SOMBRAS — Viento, Micro-CFD y Ruido
1. **Configurar el Viento:** 
   * Pulse `Descargar Datos ERA5/GWA` para rellenar automáticamente la rosa de los vientos por satélite según las coordenadas GPS del proyecto.
   * O bien pulse `Cargar Fichero Horario` e importe el archivo `.csv` de su anemómetro in-situ.
2. **Auditar la Burbuja de Cubierta:** En turbinas sobre tejado, el HUD mostrará el perfil de la nave. Si el buje queda dentro del área sombreada en rojo (*Separation Bubble*), aumente la altura de la torre o retranquee la turbina hacia el centro de la nave hasta que el indicador marque `ÓPTIMO: Zona Speed-Up (+22%)`.
3. **Calcular Isófonas Acústicas:** Pulse `Simular Ruido ISO 9613-2`. Se superpondrá sobre la escena un mapa de isolíneas acústicas. Compruebe que la línea de $55 \text{ dBA}$ no sobrepasa el lindero del polígono.
4. **Verificar Parpadeo de Sombras:** Haga clic en las ventanas de las oficinas de la nave con la herramienta `Receptor Sensible`. El sistema calculará el número de horas anuales de parpadeo. Si supera las $30 \text{ h/año}$, marque la casilla `Activar Curtailment Automático`.

#### Paso 4: INGENIERÍA — Protecciones, Cableado y Resonancia
1. **Configurar la Topología Eléctrica:** Elija entre *Acoplamiento en AC* (inversor eólico de red dedicado) o *Acoplamiento en DC* (inversor híbrido multientrada común con el campo solar).
2. **Revisar Cuadro de Freno:** El sistema añadirá automáticamente a la lista de materiales la resistencia de frenado reostático (*dump load*) y el rectificador de potencia.
3. **Validación de Secciones REBT:** RA calculará la sección de los conductores en cobre libre de halógenos. Verifique que la caída de tensión mostrada en el panel sea $\le 1{,}50\%$.
4. **Alerta de Resonancia Estructural:** Compruebe el semáforo modal $1P/3P$. Si aparece en verde, la frecuencia propia del edificio no interfiere con el régimen de giro de la máquina; si aparece en ámbar, RA prescribirá la rigidez de los *silent-blocks* elastoméricos necesarios.

#### Paso 5: ENTREGA — Despacho Híbrido, Unifilar y Gemelo SCADA
1. **Simulación 8760 h y Facturación:** Pulse `Ejecutar Despacho Horario`. El gráfico interactivo desglosará las curvas de producción solar y eólica frente a la demanda de la factura del cliente, cuantificando el ahorro por *Peak Shaving* en el término de potencia (P1-P2).
2. **Generar Documentación:** Pulse `Exportar Memoria Técnica`. Se descargará el informe visable completo en PDF junto con el **Esquema Unifilar Híbrido en norma IEC 60617**.
3. **Conectar Gemelo Digital (Fase O&M):** Cuando la planta esté instalada, active el conector WebSocket introduciendo la IP de la pasarela IoT. El aerogenerador 3D comenzará a rotar a las RPM reales de la turbina y orientará su góndola con el viento instantáneo medido en planta.

---

### 5.2. Justificación Técnica de Parámetros y Buenas Prácticas

* **¿Por qué mástiles abatibles hidráulicos en autoconsumo C&I?**  
  * *Justificación:* Alquilar una grúa telescópica de gran tonelaje para una revisión preventiva anual cuesta entre 2.000 € y 4.000 €. Una torre abatible permite realizar el mantenimiento de palas, frenos y generador a cota de suelo por dos operarios con un cabrestante hidráulico, reduciendo drásticamente el OPEX de la instalación.
* **¿Por qué cables anti-torsión en la torre?**  
  * *Justificación:* Cuando el aerogenerador orienta la góndola siguiendo los cambios de viento, el cable que baja por el fuste acumula giros de torsión mecánica. Se deben prescribir conductores con cubierta de policloropreno clase 5 extraflexible (*tipo H07RN-F*) y relés de desenrolle automático cada 3 o 4 vueltas completas.
* **¿Por qué resistencia de frenado reostático independiente de la red?**  
  * *Justificación:* Si se produce un apagón en la red pública durante una tempestad con vientos de $25 \text{ m/s}$, el inversor se desconecta por seguridad anti-isla (ITC-BT-40). Si la turbina no cuenta con una resistencia física que disipe la energía de forma inmediata mediante frenado electromagnético, el rotor se embalará por falta de carga eléctrica, provocando la desintegración mecánica de las palas por sobrevelocidad centrífuga.

---

## 6. REFERENCIAS BIBLIOGRÁFICAS Y FUENTES CIENTÍFICAS

1. **Bastankhah, M., & Porté-Agel, F. (2014).** *A new analytical model for wind-turbine wakes.* Renewable Energy, 70, 116-123.
2. **Jensen, N. O. (1983).** *A note on wind generator interaction.* Risø National Laboratory, Risø-M-2411, Roskilde, Denmark.
3. **Katic, I., Højstrup, J., & Jensen, N. O. (1986).** *A simple model for cluster efficiency.* European Wind Energy Association Conference and Exhibition, Rome, Italy, 407-410.
4. **Wilson, D. J. (1979).** *Flow patterns over flat-roofed buildings and application to exhaust stack design.* ASHRAE Transactions, 85(2), 284-295.
5. **Peterka, J. A., Meroney, R. N., & Kothari, K. M. (1985).** *Wind flow over buildings: A review of wind-tunnel tests and empirical models.* Journal of Wind Engineering and Industrial Aerodynamics, 21(3), 253-274.
6. **Burton, T., Jenkins, N., Sharpe, D., & Bossanyi, E. (2011).** *Wind Energy Handbook (2nd ed.).* John Wiley & Sons, Chichester, UK.
7. **Manwell, J. F., McGowan, J. G., & Rogers, A. L. (2010).** *Wind Energy Explained: Theory, Design and Application (2nd ed.).* John Wiley & Sons, Amherst, USA.
8. **ISO 9613-2:1996.** *Acoustics — Attenuation of sound during propagation outdoors — Part 2: General method of calculation.* International Organization for Standardization, Geneva.
9. **IEC 61400-2:2014.** *Wind energy generation systems — Part 2: Small wind turbines.* International Electrotechnical Commission, Geneva.
10. **IEC 61400-12-1:2017.** *Wind energy generation systems — Part 12-1: Power performance measurements of electricity producing wind turbines.* International Electrotechnical Commission, Geneva.
11. **Ministerio de la Presidencia (España).** *Real Decreto 244/2019, de 5 de abril, por el que se regulan las condiciones administrativas, técnicas y económicas del autoconsumo de energía eléctrica.* BOE n.º 83.
12. **Ministerio de Ciencia y Tecnología (España).** *Real Decreto 842/2002, de 2 de agosto, por el que se aprueba el Reglamento Electrotécnico para Baja Tensión (REBT) e ITCs asociadas.* BOE n.º 224.
13. **Ministerio de Vivienda (España).** *Código Técnico de la Edificación (CTE) — Documento Básico SE-AE: Acciones en la Edificación.* Real Decreto 314/2006, modificado en sucesivas revisiones.
14. **Ministerio de Medio Ambiente (España).** *Real Decreto 1367/2007, de 19 de octubre, por el que se desarrolla la Ley 37/2003 del Ruido en lo referente a zonificación acústica, objetivos de calidad y emisiones acústicas.* BOE n.º 254.

---

*Fin del Manual Científico-Técnico. Este documento constituye la base teórica y normativa vinculante para todos los algoritmos implementados en RA-Wind.*
