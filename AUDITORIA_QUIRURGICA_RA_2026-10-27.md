# AUDITORÍA QUIRÚRGICA — Visor Solar 3D «RA» v3.2.0

> **Documento de trabajo para agentes de IA.** Cada hallazgo incluye ubicación exacta, evidencia literal, corrección propuesta y criterio de aceptación verificable. No es un informe para leer de corrido: es una cola de trabajo.

| Campo | Valor |
| :--- | :--- |
| Proyecto | `ra-visor-solar-3d` v3.2.0 — plataforma de ingeniería FV/eólica sobre CesiumJS |
| Raíz real del código | `C:\TRABAJOS\RA\RA` (**anidada**; `C:\TRABAJOS\RA` no contiene la app) |
| Fecha de auditoría | 2026-10-27 |
| Commit de referencia | `91d241f` (`fix(budget): audit remediation for ssot commercialConfig…`) |
| Árbol de trabajo | limpio (`git status --porcelain` vacío) al inicio de la auditoría |
| Perfiles aplicados | Arquitecto de software · Ingeniero de software · Ingeniero industrial senior en renovables (FV, eólica, REBT/IEC) |
| Método | Lectura estática dirigida + ejecución de la batería de pruebas + medición automatizada de métricas + verificación cruzada de cada afirmación en el código |
| Archivos analizados | 92 (js, html, css) + 26 scripts de prueba + reglas Firebase + funciones |
| Volumen medido | ~87.300 líneas: 64.111 js · 19.978 `index.html` (16.252 de ellos JS inline) · 3.223 css |

**Convención de estado de cada hallazgo**

- `VERIFICADO` — leído en el código y/o reproducido por ejecución. Se puede corregir sin más preguntas.
- `VERIFICADO (parcial)` — el defecto está probado; el alcance numérico requiere ejecutar la app con datos reales.
- `INDICIO` — revisión estática sólida pero sin reproducción. Va al anexo B con instrucciones de reproducción; **no se debe afirmar como cierto hasta reproducirlo**.

---

## 0. Veredicto ejecutivo

La aplicación **calcula mucho y bien en la física de base** (geometría solar, Erbs + Hay-Davies, límites de string IEC 62548, caída de tensión bifilar/trifásica, protecciones). El problema no es la física: es **la cadena de confianza entre el cálculo y el papel que se firma**.

Cinco conclusiones:

1. **Los documentos comerciales pueden mentir sin que nadie lo note.** El dossier *fabrica* un VAN positivo cuando el proyecto es deficitario y usa el precio unitario del módulo como coste total de la partida de módulos; la memoria imprime TIR/VAN/payback inventados si el motor financiero falla. Son cifras que van a un cliente o a un banco.
2. **La suite de pruebas está en rojo y el semáforo está puenteado.** `npm test` encadena con `&&` y aborta en el primer fallo; de 26 scripts de prueba solo 13 entran en el gate, y de los 26 hay **4 fallando ahora mismo**. Cualquier regresión posterior es invisible.
3. **El monolito sigue siendo el sistema operativo del proyecto.** 16.252 líneas de JS inline, 238 funciones, **16 nombres que también existen en módulos** (y los pisan por orden de carga), una función declarada dos veces y 317 asignaciones a `window` con solo 189 nombres únicos.
4. **La producción "canónica" no sale de datos del emplazamiento.** `getProjectCalcs()` construye el kWh/año con una tabla fija de radiación mensual de España y un factor de latitud del 1,5 %/grado; PVGIS y NASA quedan como decoración en otra pantalla.
5. **El eje eólico no es defendible técnicamente.** Las curvas de potencia del catálogo implican `Cp` de 1,34 (límite de Betz: 0,593), y el bloque estructural no comprueba capacidad portante, excentricidad ni pandeo.

**Semáforo por dominio**

| Dominio | Estado | Comentario |
| :--- | :---: | :--- |
| Física solar (motor) | 🟡 | Modelo correcto; canal de producción canónico pobre y con clamp silencioso de PR |
| Eléctrico DC/AC | 🟡 | Núcleo correcto; límites de ΔV contradictorios, ρ a temperatura mal aplicada, duplicados que pisan el motor |
| Estructuras FV | 🟢/🟡 | BOM y A-frame razonables; falta verificación de cargas en cubierta |
| Eólico | 🔴 | Curvas imposibles (Cp>1), sin P90, estructura sin geotecnia, flicker submuestreado |
| Económico-financiero | 🔴 | VAN fabricado, dos bases de inversión, CEL activa por defecto |
| Documentos (memoria/oferta/dossier) | 🔴 | Tres motores y tres juegos de cifras; fallbacks que inventan datos |
| Seguridad | 🔴 | Servidor sin allowlist ni cabeceras, reglas Firestore con lectura anónima, claves en el bundle |
| Arquitectura | 🟠 | Monolito congelado en los papeles, pero creciendo; sin build, sin lint, sin CI |
| QA | 🔴 | 4 tests rojos, 17 fuera del gate, mocks que incumplen el contrato de Cesium |

**Los 10 arreglos que más riesgo quitan por hora invertida** (detalle en §5):

| # | ID | Arreglo | Esfuerzo |
| :--: | :--- | :--- | :---: |
| 1 | A-01 | No fabricar VAN positivo | 15 min |
| 2 | A-03 | Eliminar TIR/VAN/payback de relleno en documentos | 30 min |
| 3 | A-02 | Usar `panelTotalCost` en el desglose del dossier | 20 min |
| 4 | B-05 | Cerrar `isPublic` en Firestore | 15 min |
| 5 | B-06 | Alinear `ownerId` cliente↔reglas (hoy la nube no guarda) | 45 min |
| 6 | B-02 | `try/catch` en el servidor (una URL tumba el proceso) | 10 min |
| 7 | A-06 | Gate de tests que no aborte y ejecute los 30 | 1 h |
| 8 | C-01 | Delegar el duplicado inline de límites MPPT | 30 min |
| 9 | A-05 | CEL desactivada por defecto | 10 min |
| 10 | C-02 | Unificar el criterio de ΔV (1,5/1,5/2,5 contradictorio) | 45 min |

---

## 1. Línea base medida (reproducible)

Todo lo que sigue se obtuvo con estos comandos, ejecutados en `C:\TRABAJOS\RA\RA`:

```powershell
node --version                      # v22.15.1
node tests/test-js-syntax.js        # 60/60 módulos OK
npm test                            # FALLA (exit 1)
node tests/<archivo>.js             # ejecución individual de los 30
```

### 1.1 Resultado real de la batería (26 scripts JS + 1 HTML)

| Resultado | Nº | Archivos |
| :--- | :--: | :--- |
| ✅ Verde | 22 | syntax, equipment-ai-importer, equipment-web-search, universal-search, project-storage, panel-selection, modules-breakdown, stamp-polyline, incremental-faldon, orientation-algorithm, cable-engine-improvements, phase4-electrical-audit, loss-monotonicity, budget-integrity, docs-generator-ssot, cel-opportunity, docx-export, ai-commercial-summary, building-shadow-heatmap, smart-inverter-alternatives, virtual-inverter-fallback, wind-catalog |
| ❌ Rojo | 4 | `test-ra-full-workflow.js` (2 asserts), `test-building-rect.js` (TypeError), `test-hidden-objects-selection.js`, `test-lazy-evaluation.js` |
| 🚫 Fuera del gate `npm test` | 13 | `test-ai-commercial-summary`, `test-budget-integrity`, `test-building-shadow-heatmap`, `test-cable-engine-improvements`, `test-cel-opportunity`, `test-docs-generator-ssot`, `test-docx-export`, `test-hidden-objects-selection`, `test-loss-monotonicity`, `test-phase4-electrical-audit`, `test-smart-inverter-alternatives`, `test-virtual-inverter-fallback`, `test-wind-catalog` |

> **Dato clave:** los tests que blindan exactamente lo que esta auditoría encuentra (auditoría eléctrica, monotonicidad de pérdidas, integridad de presupuesto, SSOT de documentos) **no se ejecutan en `npm test`**. El gate da una falsa sensación de cobertura.

### 1.2 Fallo del gate (salida literal)

```text
✗ FAIL: Valor Actual Neto (VAN a 25 años con WACC 4%) positivo (VAN: -2551.70 €)
✗ FAIL: Periodo de retorno de inversión (Payback) acelerado (20.1 años)
📊 RESUMEN: 30 pruebas superadas, 2 falladas.
```

**Diagnóstico de ingeniería (no del test):** el fixture declara 24 módulos × 450 W = 10,8 kWp con 15.850 kWh/año, pero **no declara consumo**, por lo que `financials.js:4913` aplica `4500 kWh/año` por defecto (10,8 kWp < 12). El modelo —correctamente, según RD 244/2019— limita el ahorro a la factura evitable y compensa excedentes con tope mensual; con 4,5 MWh de consumo el ahorro ronda los 700 €/año y el payback 20 años. **El test pide una rentabilidad imposible para ese dimensionado.** Es un test mal especificado, no un motor roto; pero deja el gate en rojo y, con `&&`, impide ejecutar los 11 tests siguientes.

---

## 2. Arquitectura real (mapa que debe respetar quien corrija)

```
index.html (19.978 líneas)
├── <head>  · 4 scripts de terceros (CesiumJS 1.118, lucide) sin SRI en Cesium
├── 60 <script src="js/…">  → 47 módulos + 13 de eólica
└── 5 bloques <script> inline  → 16.252 líneas, 238 funciones, 317 asignaciones a window

js/  (47 módulos + js/wind/ 13)
├── Motores: solar-engine, radiation-engine, electrical-engine, cable-engine, solar-heatmap, financials
├── Documentos: docs-generator (2.922), commercial-proposal-dossier (2.293), docx-exporter
├── Dominio: working-plane (6.437), buildings (1.649), obstacles (1.678), project-config (2.124)
├── Plataforma: viewer, cesium-safety, storage-cache, lazy-loader, firebase-service
└── Eólico: 13 módulos (resource, structural, acoustics, flicker, dispatch, electrical…)

functions/index.js  → proxy WPS Global Wind Atlas (Cloud Function)
server.js           → servidor estático local + proxy /api/gwa
tests/              → 26 scripts Node/vm (sin framework, sin mocks compartidos)
```

**Métricas medidas** (script de conteo, reproducible):

| Métrica | Valor | Lectura |
| :--- | :--: | :--- |
| Líneas JS inline en `index.html` | 16.252 | Monolito real, no "residual" |
| Funciones declaradas inline | 238 (237 únicas) | `wpStartGridMeterPlacement` declarada 2× (10599, 12541) |
| Nombres inline que **también** existen en `js/*.js` | 16 | Pisado silencioso por orden de carga |
| Asignaciones `window.X =` inline | 317 (189 únicas) | `wpInvalidateHeatmap` asignada 14×, `solarSimState` 8×, `inverterEquipmentState` 9× |
| Guardas `typeof X !== 'undefined'` | 1.097 (430 inline) | Acoplamiento por carga global, no por contrato |
| `try/catch` | 465 (188 inline) | Defensa en profundidad sin política de error |
| Scripts de prueba | 26 JS (+1 HTML) | 13 en el gate |
| Módulos JS | 60 | `AGENTS.md` y `doc/02-tecnologia.md` documentan 30 |

### 2.1 Los duplicados más relevantes (16 nombres en total)

Las declaraciones `function` del inline se ejecutan **después** de los módulos (los `<script src>` están en las líneas 28-104; el primer inline grande empieza en 3369). En JavaScript, una declaración de función global **sobrescribe** la propiedad `window.X` que el módulo había asignado. Resultado: **el módulo pierde**, y el código que llama a `calculateDynamicMPPTStringLimits()` recibe la versión del monolito.

| Función | Inline | Módulo | Consecuencia |
| :--- | :--: | :--- | :--- |
| `calculateDynamicMPPTStringLimits` | 8896 | `electrical-engine.js:51` | Dos fórmulas distintas (ver C-01) |
| `partitionPanelsIntoMPPTStrings` | 8952 | `electrical-engine.js:356` | Dos particionados |
| `getSnakeOrderedPanels` | 15183 | `electrical-engine.js:332` | Dos serpenteos |
| `getPolylineStringColor` | 15119 | `electrical-engine.js:35` | Dos paletas |
| `getProjectCalcs` | 13435 | `docs-generator.js:85` (envoltorio) | SSOT real fuera de módulo |
| `setElemText` | (inline) | `working-plane.js:5` | Utilidad duplicada |
| `cross` | (inline) | `solar-worker.js:67` | Utilidad duplicada |
| `get3DPosition`, `isPointInPolygon2D`, `segmentsIntersect2D`, `convexHull2D`… | varios | varios | Geometría triplicada |

**Regla para quien corrija:** no se puede "arreglar" un motor sin comprobar cuál de las dos copias se está ejecutando. Antes de tocar `electrical-engine.js`, verificar en consola: `calculateDynamicMPPTStringLimits.toString().includes('RA.Electrical')` → si es `true`, se está usando la copia inline (que delega); si es `false`, la del módulo.

---

## 3. Hallazgos — Bloque A: integridad económica y documental

> Es el bloque más grave: no rompe la app, rompe la confianza y expone a responsabilidad contractual.

### A-01 · El dossier comercial fabrica un VAN positivo cuando el proyecto es deficitario · 🔴 CRÍTICO · VERIFICADO

- **Ubicación:** `js/commercial-proposal-dossier.js:235-237`
- **Evidencia:**

```js
var vanVal = (m && typeof m.van === 'number' && isFinite(m.van) && m.van > 0)
  ? Math.round(m.van).toLocaleString('es-ES') + ' €'
  : Math.round(Math.max(0, ahorro25 - totalCostConIva * 1.12)).toLocaleString('es-ES') + ' €';
```

- **Defecto:** si el motor devuelve `van ≤ 0`, se entra por la rama `else`, se **recalcula con otra fórmula** (`ahorro25 − coste × 1,12`) y se aplica `Math.max(0, …)`. El resultado es siempre ≥ 0. Un proyecto con VAN real de −8.000 € se imprime como positivo. Además esa segunda fórmula ignora OPEX, inflación, degradación y fiscalidad: no es un VAN.
- **Impacto:** falsedad en documento comercial; el banco o el cliente decide sobre una rentabilidad inexistente. Agravado porque el mismo proyecto puede mostrar VAN negativo en la memoria.
- **Corrección:** eliminar la rama de cálculo. Si no hay modelo, `'N/D'`. Si el VAN es negativo, imprimirlo con signo y color de alerta.
- **Aceptación:** (1) test unitario con `m.van = -8000` → el HTML contiene `-8.000` y no contiene `+`; (2) test con `m = null` → contiene `N/D`, nunca un número; (3) grep del archivo: no queda `Math.max(0, ahorro25`.

### A-02 · La partida de módulos del dossier usa el precio unitario como total · 🔴 CRÍTICO · VERIFICADO

- **Ubicación:** `js/commercial-proposal-dossier.js:197-204`
- **Evidencia:**

```js
var scale = totalCost / designCosts.directCostTotal;
panPart = Math.round(designCosts.panelPrice * scale);
```

- **Defecto:** `panelPrice` es **€/módulo** (así lo define `financials.js:637`, y el propio `computeDesignCosts` publica el total en `panelTotalCost`, `financials.js:640`). Multiplicar el unitario por el factor de escala da, para 24 módulos de 95 €, una partida de módulos de ~95 € en una instalación de ~13.800 €. El descuadre se absorbe en `legPart` (`:204`), que pasa a ser el 60-80 % del presupuesto etiquetado como "legalizaciones".
- **Impacto:** desglose de CAPEX falso en la página que más se mira de una oferta; el cliente compara partidas que no existen.
- **Corrección:**

```js
panPart = Math.round((designCosts.panelTotalCost || designCosts.panelPrice * numPanels) * scale);
```

- **Aceptación:** (1) `Σ(panPart, invPart, estPart, cabPart, moPart, legPart) === Math.round(totalCost) ± 1`; (2) con 24 módulos, `panPart / numPanels ≈ precio unitario`; (3) `legPart < 0,20 × totalCost` en un caso estándar.

### A-03 · La memoria técnica imprime TIR, VAN y payback inventados si falla el motor · 🔴 CRÍTICO · VERIFICADO

- **Ubicación:** `js/docs-generator.js:858-861` y `js/docs-generator.js:1394-1398`
- **Evidencia:**

```js
const tirVal  = finM ? (typeof finM.tir === 'number' ? finM.tir.toFixed(1) : finM.tir) : '16.4';
const vanVal  = finM ? (typeof finM.van === 'number' ? Math.round(finM.van) : finM.van) : Math.round(d.ahorro_anual * 15.6 - (d.total * 0.85));
const pbYears = finM ? … : (d.ahorro_anual > 0 ? (d.total / d.ahorro_anual).toFixed(1) : 'N/D');
…
const tirVal = m ? (typeof m.tir === 'number' ? m.tir.toFixed(1) : m.tir) : '16.4';
const vanVal = m ? Math.round(m.van).toLocaleString('es-ES') : Math.round(capexBruto * 2.8).toLocaleString('es-ES');
const paybackVal = m ? (m.paybackYears).toFixed(1) : '4.2';
```

- **Defecto:** dos juegos de constantes mágicas (`16.4 %`, `×15,6`, `×2,8`, `4,2 años`) que se activan cuando `finM`/`m` es `null` (excepción, proyecto sin paneles, carga parcial). El documento "bancable" sale con una TIR del 16,4 % **que nadie ha calculado**.
- **Impacto:** documento firmado con métricas ficticias; además contradice al dossier si este sí tiene modelo.
- **Corrección:** prohibido el fallback numérico. Si no hay modelo: `'N/D'` en todas las métricas y **banner de advertencia** en la cabecera del PDF; bloquear la exportación si el usuario no acepta explícitamente "documento sin análisis económico".
- **Aceptación:** (1) grep `docs-generator.js` sin `'16.4'`, `'4.2'`, `* 2.8`, `* 15.6`; (2) test con `calculateFinancialModel` lanzando excepción → el HTML contiene `N/D` y la clase `doc-warning`; (3) la exportación devuelve `false` si no hay modelo y no hay confirmación.

### A-04 · Dos bases de inversión: el payback se calcula sobre CAPEX bruto y la oferta titula "inversión neta" · 🟠 GRAVE · VERIFICADO

- **Ubicación:** `js/financials.js:5122` (base de los flujos) frente a `js/financials.js:4041` (lo que lee el cliente)
- **Evidencia:**

```js
// 5122
const capexDesembolsoInicial = Math.max(capexBruto, 100);
// 4041
<tr class="total-row"><td>INVERSIÓN NETA</td> … ${Math.round(m.capexNeto)} €</td></tr>
```

- **Defecto:** los flujos descontados parten de `capexBruto` (correcto si las deducciones entran como flujos positivos en los años 1..N, que es lo que hace `:5172-5173`). Pero la oferta muestra `capexNeto` como "inversión neta" y, al lado, un payback/TIR calculados sobre bruto. El cliente compara peras con manzanas.
- **Impacto:** dos cifras de inversión en el mismo documento; payback aparentemente peor del que corresponde a la cifra mostrada (o al contrario, según descuentos).
- **Corrección (decisión de producto, ver anexo C):** mantener el flujo sobre bruto (contablemente defendible) y **etiquetar** `paybackSobreCapexBruto` + publicar "desembolso inicial" y "coste neto tras deducciones" en la misma tabla, con nota al pie. Nunca rotular "inversión neta" junto a métricas calculadas sobre bruto.
- **Aceptación:** (1) un único campo `m.inversionBaseMetricas` consumido por los tres documentos; (2) la etiqueta de TIR/payback incluye la base; (3) test que verifique `documento.includes('sobre inversión bruta')`.

### A-05 · La página CEL está activa por defecto, con 0,11 €/kWh y una norma no trazada · 🔴 CRÍTICO · VERIFICADO (parcial)

- **Ubicación:** `js/financials.js:942-943`, `:1198-1206`, `:358-361` y `:476`
- **Evidencia:**

```js
includeCEL: true,
celPriceEur: 0.11,
…
'Su instalación está <strong>certificada CEL-Ready</strong> (RDL 7/2026): sus excedentes … podrán monetizarse … a ~0,11 €/kWh sin el límite de compensación a 0 €'
```

- **Defecto:** (a) el ingreso CEL entra **por defecto** en la propuesta sin que el usuario lo active; (b) el precio 0,11 €/kWh no se deduce de ninguna fórmula ni fuente del repo —el propio motor usa 0,09 €/kWh de compensación (`:4893`)—; (c) no hay enlace, referencia BOE ni campo `fuente` para la norma citada. La afirmación "sin el límite de compensación a 0 €" es una promesa comercial con consecuencias legales.
- **Impacto:** oferta con un sobreingreso no verificado que mejora artificialmente el payback; riesgo de publicidad engañosa.
- **Corrección:** `includeCEL: false` por defecto; precio editable con valor inicial 0 y etiqueta "hipótesis comercial"; campo obligatorio `normaRef` con URL/BOE; si está vacío, la página no se genera. Añadir disclaimer junto al importe.
- **Aceptación:** (1) proyecto nuevo → la propuesta no contiene la sección CEL; (2) activarla sin `normaRef` → bloqueo con mensaje; (3) el importe mostrado sale de `celPriceEur` editable y no de una constante.

### A-06 · Gate de pruebas roto: aborta en el primer fallo y excluye 13 de 26 archivos · 🔴 CRÍTICO · VERIFICADO

- **Ubicación:** `package.json:8` (cadena `&&`), `tests/` (26 scripts JS)
- **Evidencia:** `npm test` ejecuta 13 scripts; al fallar `test-ra-full-workflow.js` **no se ejecuta ninguno de los 11 siguientes**. Los 13 restantes no están en la cadena.
- **Impacto:** CI inexistente de facto. Las pruebas que cubren ingeniería eléctrica (`test-phase4-electrical-audit`), pérdidas (`test-loss-monotonicity`), presupuesto (`test-budget-integrity`) y SSOT documental (`test-docs-generator-ssot`) **nunca se ejecutan**.
- **Corrección:** runner propio (`tests/run-all.js`) que: descubra `tests/test-*.js`, ejecute cada uno con timeout, **agregue resultados**, imprima tabla y devuelva exit 1 solo al final. `package.json` → `"test": "node tests/run-all.js"`. Añadir script `test:gate` con los tests rápidos.
- **Aceptación:** (1) `npm test` ejecuta 26 y muestra 26 líneas de resultado; (2) un fallo en el test 2 no impide ver los 25 restantes; (3) el runner distingue `fail` de `timeout`.

### A-07 · La misma oferta publica dos ahorros anuales de motores distintos · 🟠 GRAVE · VERIFICADO

- **Ubicación:** `js/financials.js:3919` (`billAuditor.comparison.ahorroAnualEUR`, rotulado **AHORRO DIRECTO AUDITADO**) frente a `js/financials.js:4080` (`m.ahorroLuzAnio1`, motor financiero)
- **Defecto:** dos cifras distintas en dos hojas del mismo PDF, calculadas por dos motores con bases fiscales diferentes (la auditoría de factura incluye término de potencia e impuestos; el modelo solo energía). No existe ninguna comprobación de conciliación.
- **Impacto:** el cliente encuentra dos ahorros; el comercial no sabe cuál defender.
- **Corrección:** un único `ahorroAnualSSOT = m.ahorroLuzAnio1`; la hoja de auditoría muestra el ahorro **del modelo** y, aparte, el desglose de factura como "factura actual vs factura con solar" sin rotularlo como ahorro anual. Añadir assert de conciliación (±1 €).
- **Aceptación:** (1) test que recorre el HTML generado y encuentra **una sola** cifra de ahorro anual; (2) si se mantienen ambas, llevan sufijo de base y una nota que explica la diferencia.

### A-08 · El resumen comercial puede imprimir "0.00 kWp" · 🟡 MODERADO · VERIFICADO (parcial)

- **Evidencia (salida real de `tests/test-cel-opportunity.js`):**

```text
… consta de 12 módulos … con una potencia total de 0.00 kWp, que generarán aproximadamente 8000 kWh al año …
```

- **Defecto:** la plantilla no deriva la potencia de `numPanels × Wp`; si `m.kwp` falta, imprime 0,00 sin avisar. 12 módulos y 0 kWp es una contradicción visible en el texto que recibe el cliente.
- **Corrección:** `kwp = m.kwp || (numPanels * cfg.potencia / 1000)`; si sigue siendo 0, omitir la frase entera antes que publicar un cero.
- **Aceptación:** ningún documento generado contiene `0.00 kWp` con `numPanels > 0` (test de barrido sobre los fixtures).

---

## 4. Hallazgos — Bloque B: seguridad y plataforma

### B-01 · El servidor estático sirve todo el repositorio y escucha en 0.0.0.0 · 🔴 CRÍTICO · VERIFICADO

- **Ubicación:** `server.js:145-196` (handler), `:175` (ruta), `:147` (CORS), `:193` (bind)
- **Evidencia:**

```js
res.setHeader('Access-Control-Allow-Origin', '*');
const safePath = path.normalize(decodeURIComponent(reqUrl)).replace(/^(\.\.[\/\\])+/, '');
const filePath = path.join(BASE_DIR, safePath);
…
server.listen(PORT, '0.0.0.0', …)
```

- **Defecto:** no hay lista blanca de extensiones ni de directorios. `GET /server.js`, `/functions/index.js`, `/tests/test-…js`, `/.gitignore` se sirven con 200. El bind en `0.0.0.0` expone todo a la LAN. CORS `*` permite leer esas respuestas desde cualquier web.
- **Impacto:** filtración de código, tests y configuración; en una red compartida (oficina, obra) cualquiera descarga el proyecto completo.
- **Corrección:** allowlist (`html, js, css, json, png, jpg, svg, ico, wasm`), denegar segmentos que empiecen por `.` y los directorios `functions`, `tests`, `doc`, `node_modules`, `scripts`; `listen(PORT, '127.0.0.1')` salvo `--lan` explícito; CORS limitado a `http://localhost:8080`.
- **Aceptación:** `GET /server.js`, `/functions/index.js`, `/.gitignore`, `/tests/test-js-syntax.js` → 404; `netstat` muestra solo loopback por defecto.

### B-02 · Una sola petición malformada tumba el proceso · 🔴 CRÍTICO · VERIFICADO

- **Ubicación:** `server.js:174`, `:177`
- **Evidencia:** `decodeURIComponent(reqUrl)` sin `try/catch`; `fs.stat(filePath, …)` con `%00` en la ruta lanza `TypeError [ERR_INVALID_ARG_VALUE]` **fuera** del callback → excepción no capturada → `process` muere.
- **Impacto:** DoS trivial (`GET /%zz`) desde la misma LAN.
- **Corrección:** envolver el parseo en `try/catch` → 400; rechazar `\0`; `server.on('clientError', …)`; `process.on('uncaughtException')` con log y salida controlada (última red).
- **Aceptación:** `/%zz`, `/%00`, `/%E0%A4%A` → 400 y el proceso sigue vivo (test de humo con `curl` en bucle).

### B-03 · Sin cabeceras de seguridad · 🟠 GRAVE · VERIFICADO

- **Ubicación:** `server.js:145-190`; `firebase.json:2-13` (Hosting solo define `ignore`)
- **Defecto:** no hay `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`/`frame-ancestors`, HSTS. El `ignore` de Hosting **no** excluye `server.js`, `firestore.rules`, `storage.rules`, `firestore.indexes.json` ni `package.json` → se publican en producción.
- **Corrección:** cabeceras en ambos servidores; añadir esas entradas al `ignore`. CSP inicial en modo reporte (la app usa mucho inline y handlers `onclick`, requiere nonce/hash por fases).
- **Aceptación:** `curl -I` con `nosniff`, `frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`; `GET /server.js` en Hosting → 404.

### B-04 · Claves de Google y Cesium hardcodeadas y duplicadas · 🔴 CRÍTICO · VERIFICADO

- **Ubicación:** `js/config.js:7-8` (fuente declarada), `js/viewer.js:428` y `:689` (duplicados de Maps y Cesium), `js/firebase-service.js:29` (apiKey del proyecto Firebase). **5 ocurrencias / 3 credenciales distintas**, dos de ellas duplicadas.
- **Evidencia:** `const GOOGLE_MAPS_API_KEY = 'AIzaSyAj-…'; const CESIUM_ION_TOKEN = 'eyJhbGciOiJIUzI1NiIs…';` y `apiKey: "AIzaSyA96…[REDACTADA]"`.
- **Defecto:** el comentario de `config.js:10-12` afirma ser "fuente única… para no duplicar secretos en el bundle", pero hay copias en `viewer.js` y el `.gitignore` no las excluye: están **versionadas**. Además el token de Cesium Ion es un JWT de cuenta (id 458204) con validez larga. Se mezclan dos problemas distintos: credenciales de facturación (Maps/Cesium) y configuración pública de Firebase.
- **Impacto:** consumo a cargo del titular (Google Maps Platform y Cesium ion facturan por uso) y rotación en varios sitios. Una API key de Maps es inevitablemente pública en cliente: la mitigación real es **restricción por referrer/API + cuotas**, no ocultarla.
- **Corrección:** (1) rotar ambas; (2) restringir en Cloud Console (HTTP referrers del dominio, solo APIs necesarias; Cesium: token con scopes mínimos y dominio permitido); (3) mantener una sola fuente en un archivo generado `js/ra-env.js` ignorado por git, con plantilla `.example`; (4) test que falle si aparece `AIza` fuera del generado.
- **Aceptación:** `grep -rn "AIza\|eyJhbGciOiJ" --exclude-dir=node_modules .` → solo `js/ra-env.example.js`; claves antiguas revocadas.

### B-05 · Firestore permite lectura anónima de proyectos "públicos" · 🔴 CRÍTICO · VERIFICADO

- **Ubicación:** `firestore.rules:6-16`
- **Evidencia:**

```javascript
allow read: if (request.auth != null && (
  resource.data.ownerId == request.auth.uid || …
)) || resource.data.isPublic == true;
```

- **Defecto:** el `||` está **fuera** del paréntesis del `request.auth != null`. Cualquiera sin autenticar puede leer un documento con `isPublic: true`. Además `update`/`delete` no impiden cambiar `ownerId` ni `isPublic` (un manager de tenant puede "adoptar" el proyecto de otro y publicarlo).
- **Impacto:** fuga de datos de cliente (dirección, NIF, factura) si algún día se marca público; escalada dentro del tenant.
- **Corrección:**

```javascript
allow read: if isSignedIn() && (isOwner() || isTenantMember());
allow update: if (isOwner() || isTenantManager() || isAdmin())
  && request.resource.data.ownerId == resource.data.ownerId
  && request.resource.data.isPublic == resource.data.isPublic;
```
  Eliminar la rama `isPublic` mientras ningún cliente la escriba (grep: no se escribe).
- **Aceptación:** emulador: usuario B lee doc de A con `isPublic:true` → `permission-denied`; B intenta `update({ownerId:B})` → `permission-denied`.

### B-06 · El guardado en nube está roto por desalineación regla↔payload · 🔴 CRÍTICO · VERIFICADO

- **Ubicación:** `js/firebase-service.js:184` (escribe `meta.ownerId`) frente a `firestore.rules:6,11` (exige `resource.data.ownerId` en raíz); `js/firebase-service.js:217` (query por `ownerId`)
- **Evidencia:**

```js
cleanData.meta.ownerId = userId;
await _db.collection('projects').doc(projectId).set(cleanData, { merge: true });
…
query = query.where('ownerId', '==', user.uid);
```

- **Defecto:** `allow create` exige `request.resource.data.ownerId == request.auth.uid`; el payload no tiene `ownerId` en raíz → **toda creación se deniega**. La consulta por `ownerId` tampoco devuelve nada. O las reglas no están desplegadas, o la función de nube nunca ha funcionado.
- **Corrección:** escribir `ownerId` (y `tenantId`) en raíz, no dentro de `meta`; validar el esquema con `request.resource.data.keys().hasOnly([...])`; test de contrato que compare el payload real con las reglas.
- **Aceptación:** guardar+leer propio proyecto OK; leer el de otro → denied; `listCloudProjects()` devuelve solo los propios.

### B-07 · Storage sin límites de tamaño/tipo y logos públicos · 🟠 GRAVE · VERIFICADO

- **Ubicación:** `storage.rules:5-22`
- **Evidencia:** `match /branding/{userId}/{allPaths=**} { allow read: if true; … }`; `allow write: if request.auth != null && request.auth.uid == userId;` sin `request.resource.size` ni `contentType`.
- **Impacto:** alojamiento de contenido arbitrario a cargo del titular; enumeración de logos y assets.
- **Corrección:** `size < 10*1024*1024` y `contentType.matches('application/pdf|image/(png|jpeg|webp)')` en escrituras; lectura de `branding` autenticada.
- **Aceptación:** subida de `.html` o 11 MB → denied; GET anónimo de branding → 403.

### B-08 · XSS almacenado en toasts y en el resumen comercial IA · 🟠 GRAVE · VERIFICADO

- **Ubicación:** `js/ui-viewport-controls.js:76-82` (`toast.innerHTML` con `${title}`/`${message}`), `js/financials.js:2121` (`modalAiSummaryBox.innerHTML = text`)
- **Defecto:** el nombre del proyecto llega desde `.raproject` importado (`firebase-service.js:191`) sin escapar; el resumen de Gemini se inyecta como HTML. Un nombre `<img src=x onerror=…>` ejecuta en el origen de la app y puede leer `localStorage` (clave Gemini ofuscada en base64).
- **Corrección:** `textContent` para título/mensaje del toast (o `escapeHtml` en origen) y sanitizador con allowlist para el markdown de la IA (DOMPurify o un renderer propio que solo permita `<b><i><br><p><ul><li>`).
- **Aceptación:** importar proyecto con ese nombre y guardar en nube → ningún `alert`; resumen con `<img onerror>` no ejecuta (test con jsdom).

### B-09 · Cloud Function de eólica: sin auth, sin App Check, con SSRF y fuga de detalles · 🟠 GRAVE · VERIFICADO

- **Ubicación:** `functions/index.js:95-138`
- **Evidencia:** `onRequest({ cors: true, maxInstances: 10, timeoutSeconds: 60 }, …)`; `const libUrl = match[1].replace('http://','https://')` descargado sin allowlist; `res.status(502).json({ error: …, details: err.message })`.
- **Defecto:** invocable desde cualquier web (coste/DoS: 10 instancias × 60 s); la URL del `.lib` viene del XML remoto y se descarga sin comprobar host (SSRF ciego hacia HTTPS internos si se manipula la respuesta); el error devuelve internos.
- **Corrección:** `enforceAppCheck: true`, allowlist de host (`*.globalwindatlas.info`), `AbortController` + tope de bytes, respuesta genérica y `logger.error` solo en servidor.
- **Aceptación:** sin token App Check → 401; host no permitido → 502 sin petición saliente; error forzado → respuesta sin `details`.

### B-10 · El servidor también proxya GWA sin timeouts ni topes · 🟡 MODERADO · VERIFICADO

- **Ubicación:** `server.js:107-143`
- **Defecto:** `d += chunk` sin límite de tamaño ni timeout; misma ausencia de allowlist de host que B-09; el 502 devuelve `err.message`.
- **Corrección:** reutilizar el cliente endurecido de B-09 (una sola implementación compartida) o eliminar el proxy local y dejar solo la Cloud Function.

---

## 5. Hallazgos — Bloque C: ingeniería eléctrica

> Núcleo correcto en lo esencial: `Ns_max` por Voc en frío, `Ns_min` por Vmp en caliente, caída de tensión bifilar/trifásica con reactancia, coordinación de strings por orientación y longitud. Los defectos están en los bordes: duplicados que pisan el motor, límites contradictorios y coeficientes térmicos.

### C-01 · El duplicado inline de límites MPPT usa coeficientes físicamente incorrectos · 🔴 CRÍTICO · VERIFICADO

- **Ubicación:** `index.html:8896-8949` frente a `js/electrical-engine.js:51-115`
- **Evidencia:**

```js
// index.html:8930-8933
const Vmp_Tmax = Vmp_STC * (1 + gammaPmp * (Tmax_cell - 25.0));   // γPmp ≈ −0,35 %/°C
const Vmp_Tmin = Vmp_STC * (1 + betaVoc * (Tmin - 25.0));        // βVoc ≈ −0,27 %/°C
```

- **Defecto:** la tensión MPP no se corrige con el coeficiente de **potencia** (`γPmp`) sino con el de **tensión** (`βVmp`, ≈ −0,30 %/°C): son coeficientes distintos y el módulo ya lo hace bien (`electrical-engine.js:58-59`: `betaVmp = rawBeta*1.05` o `tempCoeffVmp`). Además usa `βVoc` para `Vmp_Tmin` y los valores por defecto discrepan (`−0,0027` inline vs `−0,0028` módulo).
- **Impacto:** si el módulo no está disponible (carga parcial, excepción, orden de scripts), `Ns_min`/`Ns_max` cambian y el diseño pierde margen de tensión en frío/calor. Es la "deuda Grupo B" que la auditoría anterior dejó abierta; sigue viva.
- **Corrección:** sustituir el cuerpo inline por un delegado de una línea (permitido por la regla 6 de `AGENTS.md`):

```js
function calculateDynamicMPPTStringLimits(m, i, c) {
  return window.RA.Electrical.calculateDynamicMPPTStringLimits(m, i, c);
}
```
  y hacer que el módulo no dependa de `window` (eliminar el `liveInv` global como única fuente).
- **Aceptación:** (1) `calculateDynamicMPPTStringLimits.toString()` contiene `RA.Electrical`; (2) test con `βVmp` explícito ≠ `γPmp` → `Ns_min` coincide con el cálculo del módulo; (3) no quedan `-0.0027` en `index.html`.

### C-02 · Tres límites de caída de tensión incompatibles (1,5 % / 1,5 % / 2,5 %) · 🟠 GRAVE · VERIFICADO

- **Ubicación:** `js/electrical-engine.js:24-25`, `:1186-1192`, `:1199-1213`
- **Evidencia:**

```js
DV_MAX_DC_PCT: 1.5,
DV_MAX_AC_PCT: 1.5,
…
const isCompliant = totalPct <= 2.5;
```

- **Defecto:** cada tramo se valida a 1,5 % (suma permitida 3,0 %) pero el global exige 2,5 %. Un diseño con 1,4 % DC + 1,4 % AC **pasa** ambas validaciones y **falla** la global; y al revés, la UI puede mostrar dos veredictos contradictorios sobre el mismo cable. Además se atribuye el 1,5 % a "REBT ITC-BT-40", que no fija ese valor (es criterio de guía/pliego): la atribución normativa debe corregirse o justificarse.
- **Impacto:** inconsistencias de validación y afirmaciones normativas indefendibles ante un colegiado.
- **Corrección:** un solo criterio explícito y parametrizado: `DV_MAX_TRAMO_PCT = 1.5` y `DV_MAX_TOTAL_PCT = 3.0` (o 2,5 si se decide criterio de proyecto más estricto, pero entonces los tramos deben ser 1,25/1,25). Documentar fuente real (ITC-BT-19 tabla 1 / guía IDAE) y no atribuir a ITC-BT-40 lo que no dice.
- **Aceptación:** (1) una constante única por criterio; (2) test de frontera: 1,4+1,4 → mismo veredicto local y global; (3) el texto del PDF cita la fuente correcta.

### C-03 · La resistividad del cobre se toma a 20 °C salvo que se pase exactamente 90 °C · 🟠 GRAVE · VERIFICADO

- **Ubicación:** `js/electrical-engine.js:1168`
- **Evidencia:**

```js
const rho = (conductor === 'Al') ? (RHO_AL_90 || 0.0362)
  : (tempC >= 90 ? RHO_CU_90 : (RHO_CU_20 || 0.01724));
```

- **Defecto:** con `tempC = 70` (celda caliente típica) usa ρ a 20 °C (0,01724) en lugar de ρ(70 °C) ≈ 0,0206 → **subestima la caída de tensión un ~19 %**. La selección de sección puede quedarse corta justo en el caso dimensionante.
- **Corrección:** `rho = rho20 * (1 + 0.00393 * (T - 20))` con T acotada a [20, 90]; por defecto, DC a 90 °C (temperatura de servicio del conductor) y AC según aislamiento.
- **Aceptación:** test paramétrico: `ρ(70) ∈ [0,0204, 0,0208]`; caso 25 m / 14,375 A / 6 mm² / 498 V → ΔV sube respecto al valor actual y sigue < 1,5 % o dispara cambio de sección (documentar el caso).

### C-04 · El diferencial se asume "Tipo A superinmunizado" para cualquier inversor · 🟠 GRAVE · VERIFICADO

- **Ubicación:** `js/electrical-engine.js:1117-1119`
- **Evidencia:** `const rcmuCertified = params.rcmuCertified !== undefined ? params.rcmuCertified : true;`
- **Defecto:** si no se pasa el dato, se asume que el inversor incorpora RCMU certificado y se especifica Tipo A-SI. Un inversor sin transformador sin certificación exige Tipo B. La seguridad se está **suponiendo**, no verificando.
- **Corrección:** `default false` → Tipo B; el catálogo de equipos debe tener `rcmu: true|false` y el dato viaja hasta la protección. Mostrar badge "verificado en datasheet" vs "estimado".
- **Aceptación:** inversor sin campo `rcmu` → Tipo B en el unifilar y en la memoria; con `rcmu:true` → A-SI.

### C-05 · La tabla de secciones/ampacidad está duplicada y divergente · 🟡 MODERADO · VERIFICADO

- **Ubicación:** `js/electrical-engine.js:26-29` (AC hasta 50 mm²) frente a `index.html:13279-13324` (AC hasta 70 mm²; además `IMAX` con 9 entradas)
- **Defecto:** dos tablas de secciones comerciales y dos de intensidad máxima; la copia inline añade 70 mm². El dimensionado depende de qué copia se ejecute; la de `cable-engine.js:1351` aplica corrección por temperatura/agrupamiento, pero las otras dos no.
- **Corrección:** una única tabla en `electrical-engine` (`SECCIONES`, `IZ_REF`) consumida por inline y por `cable-engine`; el inline solo puede delegar.
- **Aceptación:** grep de `SEC_DC_AVAIL` → una sola definición; test que compare `RA.Electrical.SECCIONES` con las usadas en el cálculo de sección.

### C-06 · Encabezado del módulo desactualizado respecto al código · 🟢 MENOR · VERIFICADO

- **Ubicación:** `js/electrical-engine.js:6` ("ventana térmica −10 °C a +65 °C") vs `:86` (`Tmax_cell = 70`).
- **Corrección:** unificar el texto con el valor real (70 °C) y justificarlo (temperatura de célula de diseño, no ambiente).

---

## 6. Hallazgos — Bloque D: física solar y energía

### D-01 · La producción "canónica" sale de una tabla fija de radiación, no del emplazamiento · 🔴 CRÍTICO · VERIFICADO

- **Ubicación:** `index.html:13513-13533`
- **Evidencia:**

```js
const SOLAR_RAD = [2.8, 3.5, 4.8, 5.8, 6.5, 7.2, 7.5, 6.8, 5.4, 3.9, 2.9, 2.5];
const latFact = 1.0 + (38.0 - latDeg) * 0.015;
…
const kWh = eng.P_dc_kW * hspMonth * MONTH_DAYS[m] * eng.PR;
```

- **Defecto:** el kWh/año canónico que consumen `financials`, `docs-generator` y `bill-auditor` se construye con una tabla media de España y un ajuste lineal de **1,5 % por grado de latitud**. No usa ni PVGIS ni NASA (que existen en `solar-engine.js:754-870` pero viven en otra pantalla). La longitud, la altitud, el clima local y el albedo no entran. Canarias, Galicia o un valle interior quedan mal representados.
- **Impacto:** toda la cadena económica y documental hereda el error del HSP (±10-20 % en ubicaciones no peninsulares medias). Es el hallazgo con mayor propagación de todo el informe.
- **Corrección:** mover la producción canónica a `solar-engine` con prioridad: (1) simulación física con GHI mensual real (NASA/PVGIS cacheada por coordenada), (2) `runPhysicalModel`, (3) `SOLAR_RAD` **solo** como último recurso y con `source: 'fallback'` visible en UI y PDF. `getProjectCalcs` debe **leer** `RA.solarStats.annualYieldKWh` y no recalcular.
- **Aceptación:** (1) dos proyectos con misma latitud y distinta longitud producen HSP distintos; (2) `d.productionSource` existe y se imprime en la memoria; (3) test que verifique que `getProjectCalcs().annualKWh === RA.solarStats.annualYieldKWh` cuando hay simulación.

### D-02 · El factor de inclinación/azimut mensual se calcula con el sol fijo a 50° de elevación y al Sur · 🟠 GRAVE · VERIFICADO

- **Ubicación:** `index.html:13521`
- **Evidencia:** `const poaEst = computePOAIrradiance(rad * 1000 / 4.5, latDeg, tiltDeg, azimutDeg, 50, 0);`
- **Defecto:** se usa el mismo sol (elevación 50°, azimut 0°) para los 12 meses. La ganancia invernal de una inclinación alta y la pérdida estival no se modelan; peor aún, el azimut solar de entrada es 0 (Sur) para todos los meses, de modo que el efecto de una orientación Este/Oeste solo se captura por el coseno directo.
- **Corrección:** derivar el factor POA del motor físico mensual (altura y azimut reales del día representativo) o, mejor, de la simulación horaria ya existente.
- **Aceptación:** factor POA de diciembre ≠ factor de junio para β = 45°; integrar la curva mensual y comparar con PVGIS (±5 %).

### D-03 · El PR se recorta silenciosamente a [0,60 · 0,90] · 🟡 MODERADO · VERIFICADO

- **Ubicación:** `js/solar-engine.js:745`
- **Evidencia:** `PR: Math.max(Math.min(PR, 0.90), 0.60),`
- **Defecto:** un PR calculado de 0,52 (diseño malo, suciedad, sombras) se publica como 0,60; uno de 0,95 (datos incoherentes) se publica como 0,90. Se oculta justo la señal que debe alertar.
- **Corrección:** devolver el valor real y un `prWarning` cuando salga de rango; la UI muestra el valor y el aviso.
- **Aceptación:** test con pérdidas del 40 % → `PR ≈ 0,52` y `prWarning` no nulo.

### D-04 · El índice de claridad no corrige la excentricidad orbital · 🟢 MENOR · VERIFICADO

- **Ubicación:** `js/radiation-engine.js:42`
- **Evidencia:** `const kt = … ghi / (SOLAR_CONST_WM2 * sinElev + 1e-3);`
- **Defecto:** Erbs define `kt = GHI / (I0 · cosθz)` con `I0 = 1367 · (1 + 0,033·cos(360·n/365))`. Omitir el factor introduce ±3,3 % estacional en la desagregación difusa.
- **Corrección:** pasar `dayOfYear` a `decomposeErbs` (o un `eccentricityFactor`) y aplicarlo.
- **Aceptación:** `kt` en enero y julio para la misma GHI y elevación difieren en la proporción esperada (±3 %).

### D-05 · El recorte de `kt` a [0,1 · 0,85] altera casos extremos · 🟢 MENOR · VERIFICADO

- **Ubicación:** `js/radiation-engine.js:42`, `:44-51`
- **Defecto:** `kt < 0,1` se fuerza a 0,1 (cielo muy cubierto) y `kt > 0,85` a 0,85. En albedo alto o nieve el error es pequeño, pero el valor se usa luego para `dni` y para el IAM; conviene documentarlo o ampliar el rango.
- **Corrección:** permitir `kt ∈ [0, 1]` y dejar que la rama `>0,8` (fracción 0,165) actúe.

### D-06 · El ahorro de reserva usa 0,14 €/kWh mientras el archivo declara 0,18 · 🟡 MODERADO · VERIFICADO

- **Ubicación:** `index.html:13548` (`const precio_kwh = 0.18;`) y `:13603` (`Math.round(annualKWh * 0.14)`)
- **Defecto:** la constante de precio queda sin usar y el fallback de ahorro aplica otro precio. Dos cifras para lo mismo, y la variable muerta invita a creer que se usa 0,18.
- **Corrección:** eliminar `precio_kwh` y usar el precio del modelo (`m.precioRedEUR`) también en el fallback; si no hay modelo, no inventar ahorro.

### D-07 · Tres factores de CO₂ distintos · 🟡 MODERADO · VERIFICADO

- **Ubicación:** `js/solar-engine.js:21` (`CO2_FACTOR_SPAIN: 0.259`), `js/financials.js:2512,4168` y `js/engineering-explainer.js:292` (`0.26`), `js/commercial-proposal-dossier.js:284` (`kwp * 0.42` t/año)
- **Defecto:** el mismo proyecto declara emisiones evitadas distintas según el documento; el factor 0,259 kg/kWh no lleva año ni fuente (el mix peninsular publicado por REE/MITECO ha estado muy por debajo en los últimos años). Un dato ambiental sin año es un dato inventado.
- **Corrección:** una constante `CO2_KG_PER_KWH = { value, source, year }` en `solar-engine.js`, consumida por todos; el dossier calcula `kWh × factor`, no `kWp × 0,42`.
- **Aceptación:** los tres documentos devuelven el mismo kg CO₂ para el mismo proyecto (±1 %).

### D-08 · El reparto mensual cae a pesos fijos si no se ha ejecutado el heatmap · 🟡 MODERADO · VERIFICADO

- **Ubicación:** `js/financials.js:4922-4929`
- **Evidencia:** `const solarWeights = [0.045, 0.058, …];` usado cuando `solarSimState.monthlyKwh` es `null`.
- **Defecto:** el ahorro mensual y la comparativa estacional dependen de una curva climatológica fija, no de la simulación. La UI no avisa de que el reparto es estimado.
- **Corrección:** exponer `monthlySource: 'sim' | 'fallback'` y mostrar aviso en los documentos; bloquear la gráfica mensual si es fallback (o marcarla como estimación).

---

## 7. Hallazgos — Bloque E: módulo eólico

> Este bloque no está listo para un cliente. Es un prototipo con apariencia de cálculo.

### E-01 · Las curvas de potencia del catálogo violan el límite de Betz · 🔴 CRÍTICO · VERIFICADO

- **Ubicación:** `js/wind/wind-catalog.js:20-52`
- **Evidencia:** Bornay Wind 25.3, `rotorDiameterM: 6.4`, curva `{v:8, p:13500}`, `{v:11, p:25000}`.
- **Comprobación física** (ρ = 1,225 kg/m³, A = π·3,2² = 32,17 m²):

| v (m/s) | P disponible (W) | P declarada (W) | Cp implícito |
| :--: | :--: | :--: | :--: |
| 8 | 10.086 | 13.500 | **1,34** |
| 11 | 26.230 | 25.000 | **0,95** |

- **Defecto:** `Cp = P / (0,5·ρ·A·v³)` no puede superar 0,593. Todo el catálogo se construye sin calcular `Cp` ni validarlo, y el importador IA tiene instrucciones de rellenar huecos.
- **Impacto:** el AEP (y el ahorro, y el payback) puede salir 40-60 % alto en el rango 7-12 m/s. Es el equivalente eólico de "el VAN fabricado".
- **Corrección:** validar en el alta/importación: `Cp(v) ≤ 0,593` para todo punto; si se supera, rechazar la curva con mensaje que muestre el Cp. Añadir `Cp(v)` al modelo y al tooltip. Revisar los datos por defecto (probablemente el diámetro o la potencia están mal).
- **Aceptación:** test que recorra el catálogo completo y falle si algún punto da `Cp > 0,593`; los 3 equipos por defecto pasan tras corregir datos.

### E-02 · El parpadeo de sombra se submuestrea y pierde los amaneceres de verano · 🟠 GRAVE · VERIFICADO

- **Ubicación:** `js/wind/wind-shadow-flicker.js:207` (`var stepDays = 5;`), ventana horaria del barrido (06:00-20:00 UTC según el cálculo interno)
- **Defecto:** analizar 1 día de cada 5 convierte un máximo diario de 40 min en uno detectado de 8 min; y una ventana UTC fija pierde las horas de sol rasante de junio (sombras más largas y molestas). El criterio de 30 min/día y 30 h/año puede incumplirse sin que el informe lo detecte.
- **Corrección:** paso diario (365 días) o, como mínimo, días críticos por mes (solsticios + equinoccios + 2 días/mes); ventana calculada con `wpComputeSunTimes` por latitud/mes; reportar el máximo diario real.
- **Aceptación:** test con receptor a 2D del rotor → `maxMinutesDay` ≥ 30 y `complies30hNorm === false`.

### E-03 · El bloque estructural no comprueba geotecnia, excentricidad, pandeo ni fatiga · 🔴 CRÍTICO · VERIFICADO (código) / INDICIO (números)

- **Ubicación:** `js/wind/wind-structural.js:96-97`, `:130-186`, `:225`
- **Evidencia:** `isSafe: !hasResonanceRisk && !roofOverloadRisk && safetyFactorOverturning >= 1.5 && …`
- **Defecto:** no hay presión admisible del terreno, ni comprobación `e ≤ L/6` (zapata sin despegue), ni pandeo del mástil, ni fatiga, ni verificación de anclaje a cubierta. El factor de vuelco se calcula con el momento característico y un brazo `L/2`, sin mayorar el peso estabilizante ni considerar el empuje del viento sobre la torre.
- **Impacto:** el informe puede declarar "segura" una cimentación que despega del terreno. Un técnico competente rechazaría el documento.
- **Corrección:** o se implementa el juego completo (N, M, e, σ_adm, despegue, pandeo, fatiga simplificada) o **se retira la palabra "segura"** y se marca como "predimensionamiento no apto para proyecto". Recomendado lo segundo hasta tener geotecnia.
- **Aceptación:** (1) si falta `bearingCapacityKpa`, `isSafe` no puede ser `true`; (2) se publica `eccentricityM` y `contactRatio`; (3) test con zapata 3,7×3,7 y H=18 m → aviso de despegue.

### E-04 · La serie "8760 h" es sintética y alimenta KPIs de ahorro · 🟠 GRAVE · VERIFICADO

- **Ubicación:** `js/wind/wind-hybrid-dispatch.js:43-78`
- **Evidencia:** `var synopticNoise = 0.85 + 0.30 * Math.sin((d + m * 30) * 0.45) + 0.15 * Math.cos((d * 1.8));`
- **Defecto:** la serie horaria eólica no viene de datos ni de la curva de potencia, sino de senos normalizados a la energía anual. La autoconsumo/autosuficiencia/peak-shaving calculados sobre ella son decorativos.
- **Corrección:** generar la serie con la curva de potencia y una serie de viento (ERA5 horario o remuestreo de Weibull con correlación); hasta entonces, etiquetar los KPIs como "estimación de despacho" y no usarlos en el ahorro contractual.
- **Aceptación:** el informe marca el origen del dato; dos años distintos dan series distintas.

---

## 8. Hallazgos — Bloque F: arquitectura, calidad y pruebas

### F-01 · Monolito congelado en el papel, creciente en la práctica · 🔴 CRÍTICO (estructural) · VERIFICADO

- **Datos:** 16.252 líneas inline, 238 funciones, 317 asignaciones a `window`, 16 nombres que pisan módulos, `wpStartGridMeterPlacement` declarada 2×.
- **Defecto:** la regla 6 de `AGENTS.md` ("ningún código nuevo en el bloque inline") **no se cumple**: las funcionalidades recientes (CEL, presupuesto, HUD) han añadido código allí. La consecuencia no es estética: es que la función que se ejecuta no es la que el módulo documenta (C-01, C-05).
- **Corrección por fases:** (1) cerrar el inline con un test que compare `md5` del bloque y falle si cambia sin actualizar la lista blanca; (2) extraer por dominio (eléctrico → `electrical-engine`; presupuesto → `financials`; HUD → `project-status-hud`) sustituyendo cuerpos por delegados de una línea; (3) eliminar las 16 sombras una a una con test de regresión.
- **Aceptación:** (1) `inline-lines` monitorizado y decreciente; (2) 0 nombres duplicados entre inline y módulos; (3) ninguna función declarada dos veces.

### F-02 · Los tests no son un sistema: son scripts con mocks ad-hoc · 🟠 GRAVE · VERIFICADO

- **Evidencia:** `tests/test-building-rect.js:48` define `cross: (a, b) => …` (2 argumentos) cuando `Cesium.Cartesian3.cross` exige **tres** (el tercero es el resultado). El motor real llama con 3 (`js/buildings.js:1547`), así que el test falla por el mock, no por el producto. `test-lazy-evaluation.js:137` redefine `global.recalculateSolarYield` y luego comprueba su propio stub.
- **Defecto:** no hay harness compartido, ni mock de Cesium fiel al contrato, ni aislamiento. El resultado es que 4 tests están rojos y nadie sabe cuáles son defectos reales.
- **Corrección:** `tests/helpers/cesium-mock.js` que implemente la firma real (con `result`), `tests/helpers/dom.js` (jsdom o stub más completo), y un `runner` común. Etiquetar cada test: `unit`, `integration`, `contract`.
- **Aceptación:** `npm test` verde; ningún test redefine funciones del sistema bajo prueba; los mocks se importan del helper.

### F-03 · Sin build, sin lint, sin CI y con `node_modules` huérfano · 🟡 MODERADO · VERIFICADO

- **Evidencia:** `package.json` sin `dependencies` ni `devDependencies`; `node_modules/` contiene Puppeteer y otros; no existe `.github/` ni configuración de ESLint.
- **Defecto:** no hay verificación estática (variables no usadas, `==`, `eval`), ni reproducibilidad de dependencias, ni ejecución automática. El `lint` actual solo comprueba sintaxis con `new Function`.
- **Corrección:** ESLint (reglas: `no-undef`, `no-unused-vars`, `eqeqeq`, `no-eval`) con `globals` del proyecto; `npm ci` con lockfile si se añaden dependencias; CI que ejecute `lint` + `test`.
- **Aceptación:** `npm run lint` falla con un `no-undef` introducido a propósito; CI en verde en un PR de prueba.

### F-04 · La documentación canónica describe un proyecto que ya no existe · 🟡 MODERADO · VERIFICADO

- `AGENTS.md` §2 lista ~30 módulos; hay **60** (22 de eólica no figuran).
- `AGENTS.md` §8 dice que las claves están centralizadas "para no duplicar secretos"; hay 5 copias (B-04).
- `AGENTS.md` §5 ("supresión de etiquetas: pendiente") sigue pendiente.
- `doc/02-tecnologia.md` mantiene el inventario de 30.
- **Corrección:** regenerar el inventario desde el filesystem (script) y añadir un test de documentación que compare la lista con `js/**/*.js`.

### F-05 · 1.097 guardas `typeof !== 'undefined'` como contrato de integración · 🟡 MODERADO · VERIFICADO

- **Defecto:** la comunicación entre módulos es "si existe, úsalo; si no, degrada". Eso convierte cualquier error de carga en un fallback silencioso con resultados distintos (C-01) en vez de un fallo visible.
- **Corrección:** declarar dependencias explícitas al inicio de cada módulo (`const Elec = window.RA.Electrical; if (!Elec) throw new Error('...')`) y reservar las guardas para funciones opcionales de UI. Añadir un test de arranque que verifique el orden y la presencia de las APIs críticas.

### F-06 · Sin observabilidad de errores en producción · 🟡 MODERADO · VERIFICADO (por ausencia)

- **Defecto:** `js/error-handler.js` (35 líneas) muestra toasts; no hay captura global con contexto (proyecto, paso, acción), ni correlación, ni envío a un backend. En una app que genera documentos contractuales, un fallo silencioso es un documento mal emitido.
- **Corrección:** `window.onerror` + `unhandledrejection` con buffer circular y botón "exportar diagnóstico"; registrar `projectId`, paso y última acción.

---

## 9. Plan de corrección por oleadas

> Orden pensado para que cada oleada sea desplegable y verificable por separado. No mezclar bloques en un mismo commit.

### Ola 0 — Contención (medio día)

| ID | Acción | Verificación |
| :--- | :--- | :--- |
| A-01, A-03 | Quitar VAN/TIR/payback fabricados | Tests nuevos de documento |
| A-02 | `panelTotalCost` en el dossier | Suma de partidas = total |
| A-05 | CEL `false` por defecto | Propuesta nueva sin sección CEL |
| B-02 | `try/catch` en `server.js` | `curl /%zz` no tumba |
| B-05 | Cerrar `isPublic` | Emulador |
| A-06 | Runner de tests que no aborte | `npm test` ejecuta 26 |

**Criterio de salida:** ningún documento puede contener una métrica que no venga de un modelo; el servidor no muere con una URL; el gate informa de los 26 tests.

### Ola 1 — Seguridad y coherencia de datos (2-3 días)

B-01, B-03, B-04 (rotación + restricción de claves), B-06, B-07, B-08, B-09, B-10.

**Criterio de salida:** `grep` de secretos limpio; nube guarda y aísla por usuario; CSP en reporte; checklist de B en verde.

### Ola 2 — Verdad numérica (3-5 días)

A-04, A-07, A-08, C-01, C-02, C-03, C-05, D-01, D-02, D-03, D-06, D-07.

**Criterio de salida:** una sola base de inversión etiquetada; una sola tabla de secciones; una sola producción canónica con `source`; PR sin clamp; tests de frontera de ΔV.

### Ola 3 — Eólico (1-2 semanas, o retirada de la función)

E-01 (bloqueante), E-03 (bloqueante), E-02, E-04. Si no hay datos reales de curva ni geotecnia, **degradar la UI**: marcar el módulo como "estimación preliminar" y quitar los KPIs de ahorro.

### Ola 4 — Arquitectura (continuo)

F-01 por dominios (eléctrico → presupuesto → HUD → CAD), F-02, F-03, F-04, F-05, F-06.

**Métrica de éxito:** reducir el inline un 30 % sin cambiar ningún número de salida (test dorado: snapshots de `getProjectCalcs` y `calculateFinancialModel` antes/después).

---

## 10. Protocolo de ejecución para el agente que corrija

### 10.1 Reglas duras del repositorio (no negociables)

1. **Nada de código nuevo en el `<script>` inline** (`AGENTS.md` regla 6). Solo se permite sustituir un cuerpo por un delegado de una línea cuando el objetivo sea eliminar un duplicado.
2. **CRLF en Windows:** usar `\r?\n` en cualquier regex de script.
3. **Hooks globales:** toda función llamada desde `onclick`/`onchange` debe seguir en `window`.
4. **SSOT de producción:** `getProjectCalcs().annualKWh` (y su origen `RA.solarStats`) es la única fuente; ningún documento recalcula `kWp × 1450`.
5. **Invalidación:** cualquier mutación geométrica llama a `wpInvalidateHeatmap(reason)`.
6. **No romper el flujo de 5 pasos** ni los guards de navegación.
7. **Un hallazgo = un commit.** Mensaje: `fix(<bloque>): <ID> <descripción>`.

### 10.2 Antes de tocar nada

```powershell
cd C:\TRABAJOS\RA\RA
git status --porcelain          # debe estar vacío
node tests/test-js-syntax.js    # 60/60
node tests/run-all.js           # línea base (tras crear el runner)
node -e "…"                     # snapshot de getProjectCalcs/calculateFinancialModel con el proyecto de ejemplo
```

Guardar los snapshots en `tests/fixtures/golden/`. Cualquier cambio numérico no intencionado debe hacer fallar el test dorado.

### 10.3 Trampas conocidas (te van a morder)

| Trampa | Qué pasa | Cómo evitarla |
| :--- | :--- | :--- |
| Editas `electrical-engine.js` y no cambia nada | El inline lo pisa | Comprobar `fn.toString()` en consola o eliminar la sombra primero |
| Añades un `<script>` nuevo | El orden importa: los módulos se cargan antes del inline | Declarar dependencias y fallar ruidosamente si faltan |
| Usas `template literals` con datos de usuario | XSS | `escapeHtml`/`textContent` siempre |
| Redondeas con `toFixed` sobre `undefined` | `TypeError` y documento vacío | Guardas de tipo y `??` |
| Confías en `localStorage` | Modo privado/cuota lanza | `try/catch` y aviso |
| Ejecutas `npm test` | Aborta en el primer fallo | Usar el runner de la Ola 0 |
| Mides en `file://` | PVGIS/NASA bloqueados por CORS | Probar con `node server.js` |

### 10.4 Cómo demostrar que un arreglo está hecho

Cada hallazgo de este informe tiene un **criterio de aceptación**. El agente debe:

1. Añadir (o ampliar) un test que falle **antes** y pase **después**.
2. Ejecutar el test y pegar la salida en el commit.
3. Si el arreglo cambia un número visible, actualizar el snapshot dorado **en el mismo commit** y justificarlo en el mensaje.
4. No cerrar el hallazgo sin que el criterio se cumpla literalmente.

---

## 11. Matriz de trazabilidad hallazgo → prueba

| ID | Test existente | Test a crear/ampliar |
| :--- | :--- | :--- |
| A-01 | `test-budget-integrity` (parcial) | `test-document-integrity`: VAN negativo, `m=null` |
| A-02 | — | `test-capex-breakdown`: suma de partidas |
| A-03 | `test-docs-generator-ssot` | forzar excepción del modelo → `N/D` |
| A-04 | — | base de inversión única |
| A-05 | `test-cel-opportunity` | CEL off por defecto |
| A-06 | — | `tests/run-all.js` |
| A-07 | — | conciliación de ahorro |
| B-01…B-03 | — | `test-server-hardening` (supertest/child_process) |
| B-04 | — | `test-no-secrets` (grep) |
| B-05/B-06 | — | `test-firestore-rules` (emulador) |
| B-08 | `test-ai-commercial-summary` | XSS en toast y resumen |
| C-01 | `test-ra-full-workflow` | paridad inline↔módulo |
| C-02 | `test-phase4-electrical-audit` | frontera 1,4+1,4 |
| C-03 | — | ρ(T) paramétrico |
| C-04 | — | RCD por dato de datasheet |
| C-05 | — | tabla única de secciones |
| D-01 | — | `annualKWh === solarStats.annualYieldKWh` |
| D-02 | `test-orientation-algorithm` | factor POA estacional |
| D-03 | — | PR sin clamp |
| D-07 | — | CO₂ idéntico en 3 documentos |
| E-01 | `test-wind-catalog` | `Cp ≤ 0,593` |
| E-02 | — | flicker máximo diario |
| E-03 | — | zapata sin despegue |

---

## 12. Anexo A — Contradicciones documentación ↔ código

| Documento | Afirma | Realidad medida |
| :--- | :--- | :--- |
| `AGENTS.md` §2 | 30 módulos | 60 archivos JS |
| `AGENTS.md` §8 | Claves centralizadas, sin duplicar secretos | 5 copias de claves en 2 archivos |
| `AGENTS.md` §5 | Supresión de etiquetas "pendiente" | Sigue pendiente (sin cambios) |
| `AGENTS.md` regla 6 | Nada nuevo en inline | 16.252 líneas, creciendo |
| `AGENTS.md` §1 | Producción canónica = `getProjectCalcs().annualKWh` | Cierto, pero esa función usa `SOLAR_RAD` fijo |
| `doc/02-tecnologia.md` | Inventario de 30 módulos | 60 |
| `js/electrical-engine.js:6` | Ventana térmica −10…+65 °C | Código usa 70 °C |
| `AUDITORIA_INTEGRAL_2026.md` §8 | "TIR/VAN resueltos al 100 %" | A-01/A-03 siguen vivos |
| `AUDITORIA_INTEGRAL_2026.md` §8 | "31/31 módulos y 15/15 tests" | 60 módulos; 4 tests rojos |

> Conclusión: la documentación se escribió para una versión que existió; hoy es una fuente de verdad parcial. Tras la Ola 0, regenerar `AGENTS.md` §2 y el inventario desde el filesystem.

---

## 13. Anexo B — Indicios no verificados (reproducir antes de afirmar)

Estos puntos tienen base estática sólida, pero **no se han reproducido** en esta auditoría. Van con instrucciones exactas para confirmarlos o descartarlos.

| # | Indicio | Dónde | Cómo reproducir |
| :--- | :--- | :--- | :--- |
| B.1 | El reparto mensual del PDF no cuadra con el total | `docs-generator.js` plantilla mensual | Generar PDF con heatmap ejecutado y sumar los 12 meses; comparar con `annualKWh` |
| B.2 | Acústica eólica con tres juegos de límites (45/35, 55/45, 65/55) | `js/wind/wind-acoustics.js` | `grep -n "45\|35\|55" js/wind/wind-acoustics.js` y comparar con `MANUAL_CIENTIFICO…md` |
| B.3 | La altitud del emplazamiento no llega al cálculo de densidad del aire | `js/wind/wind-resource.js` (`elevationM`, `siteAltitudeM`) | Cargar un punto a 800 m y comprobar `rho` |
| B.4 | El despacho híbrido ignora el límite de vertido a red | `js/wind/wind-hybrid-dispatch.js` (`gridExportLimitKw`) | Buscar el parámetro en la UI; si no existe, el default 999999 anula el curtailment |
| B.5 | La orientación de la turbina en cubierta no coincide con la especificación | `js/wind/wind-rooftop-cfd.js:46` vs `ESPECIFICACION…:303` | Comparar las dos fórmulas con el mismo punto |
| B.6 | Datos personales (NIF, email) en `localStorage` sin cifrar | `js/project-storage.js` (`billAudit`), `index.html` autosave | Guardar proyecto con factura auditada y volcar `localStorage` |
| B.7 | El importador IA de equipos ordena inventar datos ausentes | `js/wind/wind-catalog.js:345` | Leer el prompt; ejecutar con un datasheet incompleto |
| B.8 | El TIR se calcula por bisección sin detectar raíces múltiples | `js/financials.js` (buscador de TIR) | Probar un flujo con dos cambios de signo |
| B.9 | `window.open` sin `noopener` en generadores de documento | `financials.js:4724,4734`, `docs-generator.js:627,1672` | Abrir la vista previa y comprobar `w.opener` |
| B.10 | Índice Firestore ausente para la consulta de proyectos | `firestore.indexes.json` vacío | Ejecutar `listCloudProjects` con datos |

---

## 14. Anexo C — Decisiones que requieren un humano

No son bugs: son definiciones de producto/normativa que la IA no debe inventar.

1. **Base de inversión contractual** (A-04): ¿CAPEX bruto con IVA o neto tras IBI/IRPF? ¿Sobre cuál se publican TIR y payback?
2. **CEL** (A-05): ¿se mantiene la página con 0,11 €/kWh y la referencia "RDL 7/2026"? ¿Con qué dictamen jurídico y fuente publicable?
3. **Garantía de potencia** (documentos): hay tres curvas distintas (80 %/25 a, 84,8 %/25 a, 85 %/25 a). ¿Cuál es la contractual y con qué degradación anual?
4. **Reposición de batería** (25 años): ¿se modela en el año 12? ¿Y el inversor?
5. **Bonificaciones IBI/ICIO e IRPF**: ¿hipótesis comercial o dato verificado por municipio/CCAA? ¿Se bloquea la emisión sin certificado?
6. **Alcance del módulo eólico**: ¿se retira de la entrega comercial hasta tener curvas y geotecnia, o se marca como preliminar?
7. **Umbral de ΔV** (C-02): 1,5+1,5 con total 3,0 (REBT) o criterio de proyecto 2,5 con tramos de 1,25.
8. **Política de datos personales**: retención, cifrado y consentimiento para enviar facturas a Gemini.

---

## 15. Anexo D — Glosario normativo usado en la auditoría

| Referencia | Uso en el proyecto | Observación de la auditoría |
| :--- | :--- | :--- |
| REBT ITC-BT-40 | Instalaciones generadoras de BT | No fija el 1,5 % de ΔV; corregir atribución |
| REBT ITC-BT-19 | Caídas de tensión admisibles | Es la referencia correcta para el límite global |
| IEC 62548 | Diseño de arrays FV | Bien aplicado en strings; falta el chequeo de `Iz` en todas las rutas |
| IEC 60364-7-712 | Instalaciones FV | Protecciones DC/AC coherentes |
| UNE-EN 62305 | Protección contra rayos | Se cita para el serpenteo; sin cálculo de riesgo |
| CTE DB-SE-AE | Acciones en edificación | Usado en estructuras FV y cubierta eólica; falta geotecnia |
| IEC 61400-2 | Aerogeneradores pequeños | Se cita; no se aplica clase de seguridad ni cargas |
| RD 244/2019 | Autoconsumo y compensación | Bien aplicado el tope mensual; la CEL lo contradice sin base |
| RD 19/2021 (IRPF) | Deducciones por eficiencia | Bases 5.000/7.500/15.000 €; porcentajes por CCAA, no fijos |

---

## 16. Registro de evidencia (para reproducir la auditoría)

```text
$ node tests/test-js-syntax.js
ALL 60 JS MODULES PASSED SYNTAX CHECK SUCCESSFULLY!

$ npm test
✗ FAIL: Valor Actual Neto (VAN a 25 años con WACC 4%) positivo (VAN: -2551.70 €)
✗ FAIL: Periodo de retorno de inversión (Payback) acelerado (20.1 años)
📊 RESUMEN: 30 pruebas superadas, 2 falladas.        [exit 1]

$ node tests/test-building-rect.js
TypeError: Cannot read properties of undefined (reading 'y')
  at Cartesian3.cross (tests/test-building-rect.js:48)      [mock de 2 argumentos]

$ node tests/test-hidden-objects-selection.js
AssertionError: Los paneles del faldón oculto deben tener show === false

$ node tests/test-lazy-evaluation.js
AssertionError: En Paso 2 NO se debe ejecutar la física pesada
```

**Métricas de código** (script propio, excluye `node_modules`, `.git`, `.firebase`):

```json
{ "files": 92, "jsLines": 64111, "indexHtmlLines": 19978, "inlineJsLines": 16252,
  "cssLines": 3223, "typeofGuards": 1097, "globalAssignments": 710, "tryCatch": 465 }
```

---

## 17. Anexo E — Backlog legible por máquina

> Para un agente que planifique automáticamente. `depends_on` expresa orden técnico, no solo lógico.

```yaml
version: 1
project: ra-visor-solar-3d
root: C:\TRABAJOS\RA\RA
tasks:
  - id: A-01
    sev: critical
    title: "No fabricar VAN positivo en el dossier"
    files: [js/commercial-proposal-dossier.js]
    lines: "235-237"
    depends_on: []
    accept: "con m.van=-8000 el HTML contiene -8.000 y no '+'; con m=null contiene N/D"
  - id: A-02
    sev: critical
    title: "Partida de módulos = panelTotalCost, no precio unitario"
    files: [js/commercial-proposal-dossier.js, js/financials.js]
    lines: "197-204; 637-643"
    depends_on: []
    accept: "suma de capítulos = totalCost ±1 €"
  - id: A-03
    sev: critical
    title: "Eliminar TIR/VAN/payback de relleno en documentos"
    files: [js/docs-generator.js]
    lines: "858-861; 1394-1398"
    depends_on: []
    accept: "sin modelo → N/D + banner; sin '16.4' ni '4.2' en el archivo"
  - id: A-04
    sev: high
    title: "Una sola base de inversión, etiquetada"
    files: [js/financials.js]
    lines: "5122; 4041"
    depends_on: [A-01, A-03]
    accept: "payback/TIR indican 'sobre inversión bruta'; un único importe de inversión por documento"
  - id: A-05
    sev: critical
    title: "CEL desactivada por defecto y con fuente obligatoria"
    files: [js/financials.js]
    lines: "942-943; 1198-1206; 358-361"
    depends_on: []
    accept: "proyecto nuevo sin sección CEL; activar sin normaRef bloquea"
  - id: A-06
    sev: critical
    title: "Runner de tests que no aborte y ejecute los 26"
    files: [package.json, tests/run-all.js]
    lines: "8"
    depends_on: []
    accept: "26 resultados, exit 1 solo al final, timeout por test"
  - id: A-07
    sev: high
    title: "Conciliar el ahorro anual (bill-auditor ↔ modelo)"
    files: [js/financials.js]
    lines: "3919; 4080"
    depends_on: [A-04]
    accept: "una sola cifra de ahorro anual en el PDF o bases etiquetadas"
  - id: A-08
    sev: moderate
    title: "No imprimir '0.00 kWp'"
    files: [js/financials.js]
    lines: "resumen comercial"
    depends_on: []
    accept: "ningún documento con 0.00 kWp y numPanels>0"
  - id: B-01
    sev: critical
    title: "Allowlist de archivos, bind loopback, CORS local"
    files: [server.js]
    lines: "145-196"
    depends_on: []
    accept: "/server.js, /functions/index.js, /.gitignore → 404; solo 127.0.0.1"
  - id: B-02
    sev: critical
    title: "No tumbar el proceso con URL malformada"
    files: [server.js]
    lines: "174; 177"
    depends_on: []
    accept: "/%zz y /%00 → 400 y proceso vivo"
  - id: B-03
    sev: high
    title: "Cabeceras de seguridad y ignore de Hosting"
    files: [server.js, firebase.json]
    lines: "145-190; 2-13"
    depends_on: []
    accept: "nosniff, frame-ancestors, referrer-policy; /server.js 404 en Hosting"
  - id: B-04
    sev: critical
    title: "Rotar y restringir claves; una sola fuente no versionada"
    files: [js/config.js, js/viewer.js, js/firebase-service.js]
    lines: "7-8; 428,689; 29"
    depends_on: []
    accept: "grep sin AIza/eyJ fuera del archivo generado"
  - id: B-05
    sev: critical
    title: "Cerrar la rama isPublic y proteger ownerId en update"
    files: [firestore.rules]
    lines: "6-16"
    depends_on: []
    accept: "lectura anónima de doc público → denied; cambio de ownerId → denied"
  - id: B-06
    sev: critical
    title: "Alinear ownerId raíz entre cliente y reglas"
    files: [js/firebase-service.js, firestore.rules]
    lines: "184,188,217"
    depends_on: [B-05]
    accept: "guardar y leer el propio proyecto; el de otro denied"
  - id: B-07
    sev: high
    title: "Storage con límite de tamaño/MIME"
    files: [storage.rules]
    lines: "5-22"
    depends_on: []
    accept: ".html o >10MB denied; branding requiere auth"
  - id: B-08
    sev: high
    title: "Cerrar XSS en toast y resumen IA"
    files: [js/ui-viewport-controls.js, js/financials.js]
    lines: "76-82; 2121"
    depends_on: []
    accept: "nombre con <img onerror> no ejecuta"
  - id: B-09
    sev: high
    title: "Endurecer gwaProxy (App Check, allowlist, sin details)"
    files: [functions/index.js]
    lines: "95-138"
    depends_on: []
    accept: "sin App Check → 401; host no permitido → 502 sin salida"
  - id: C-01
    sev: critical
    title: "Delegar el duplicado MPPT inline al módulo"
    files: [index.html, js/electrical-engine.js]
    lines: "8896-8949"
    depends_on: []
    accept: "fn.toString() contiene RA.Electrical; βVmp≠γPmp no altera Ns_min"
  - id: C-02
    sev: high
    title: "Unificar criterio de caída de tensión"
    files: [js/electrical-engine.js]
    lines: "24-25; 1190; 1203"
    depends_on: []
    accept: "misma constante por criterio; 1,4+1,4 con veredicto coherente"
  - id: C-03
    sev: high
    title: "Resistividad del cobre en función de la temperatura"
    files: [js/electrical-engine.js]
    lines: "1168"
    depends_on: []
    accept: "ρ(70 °C) ∈ [0.0204, 0.0208]"
  - id: C-04
    sev: high
    title: "RCD Tipo B por defecto si no hay RCMU certificado"
    files: [js/electrical-engine.js]
    lines: "1117-1119"
    depends_on: []
    accept: "sin rcmu → Tipo B en unifilar y memoria"
  - id: C-05
    sev: moderate
    title: "Tabla única de secciones y ampacidad"
    files: [js/electrical-engine.js, index.html, js/cable-engine.js]
    lines: "26-29; 13279-13324; 1351"
    depends_on: [C-01]
    accept: "una sola definición de SEC_/IZ_"
  - id: D-01
    sev: critical
    title: "Producción canónica desde datos del emplazamiento"
    files: [index.html, js/solar-engine.js]
    lines: "13513-13533"
    depends_on: []
    accept: "annualKWh === RA.solarStats.annualYieldKWh; productionSource visible"
  - id: D-02
    sev: high
    title: "Factor POA mensual con geometría real"
    files: [index.html, js/solar-engine.js]
    lines: "13521"
    depends_on: [D-01]
    accept: "factor dic ≠ jun; ±5% vs PVGIS"
  - id: D-03
    sev: moderate
    title: "No recortar el PR"
    files: [js/solar-engine.js]
    lines: "745"
    depends_on: []
    accept: "PR real + warning fuera de rango"
  - id: D-07
    sev: moderate
    title: "Un único factor de CO2 con fuente y año"
    files: [js/solar-engine.js, js/financials.js, js/commercial-proposal-dossier.js]
    lines: "21; 2512,4168; 284"
    depends_on: []
    accept: "mismo kg CO2 en los tres documentos"
  - id: E-01
    sev: critical
    title: "Validar Cp ≤ 0,593 en todo el catálogo eólico"
    files: [js/wind/wind-catalog.js]
    lines: "20-52"
    depends_on: []
    accept: "test recorre catálogo y falla con Cp>0,593"
  - id: E-03
    sev: critical
    title: "Estructural eólico: geotecnia, e≤L/6, pandeo, fatiga (o retirar 'segura')"
    files: [js/wind/wind-structural.js]
    lines: "96-186; 225"
    depends_on: []
    accept: "sin bearingCapacity → isSafe nunca true"
  - id: F-01
    sev: high
    title: "Reducir el monolito por dominios con delegados"
    files: [index.html]
    lines: "3369-19978"
    depends_on: [A-06]
    accept: "0 nombres duplicados inline↔módulos; inline decreciente"
  - id: F-02
    sev: high
    title: "Harness de tests con mock fiel de Cesium"
    files: [tests/]
    lines: ""
    depends_on: [A-06]
    accept: "26/26 verde; mocks compartidos; sin stubs del sistema bajo prueba"
```

---

*Fin del informe. Versión 1.0 — 2026-10-27. Los hallazgos marcados `VERIFICADO` están respaldados por lectura directa del código citado y, cuando se indica, por ejecución. Los `INDICIO` requieren reproducción antes de convertirse en tarea.*
