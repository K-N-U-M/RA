# ⚡ MASTER PLAN DE INGENIERÍA Y ARQUITECTURA (NIVEL DIOS): REFACTORIZACIÓN CANÓNICA DEL ECOSISTEMA DE PRESUPUESTACIÓN, MOTORES FINANCIEROS Y MAQUETACIÓN EDITORIAL (PASO 5)

> **Propósito del Documento:** Especificación técnica determinista, modular y libre de ambigüedades diseñada para ser ejecutada por un Agente de IA de Ingeniería de Software Senior.
> **Principio Rector:** **Arquitectura Modular No Invasiva**. Ningún cambio en el Paso 5 (`financials.js`, `commercial-proposal-dossier.js`, `docs-generator.js`, `company-branding.js`, `bom-tree.js`) puede degradar ni alterar el estado geométrico 3D (`Cesium`, `WP.polylines`), la simulación física (`solar-engine.js`) ni el enrutamiento eléctrico (`electrical-engine.js`).
> **Protocolo de Ejecución:** Ejecución estricta **por Fases (Hitos 1 a 5)**. Al finalizar cada fase, se debe validar la suite de pruebas visuales y numéricas antes de pasar a la siguiente.

---

## 🏗️ MAPA DE ARQUITECTURA Y FLUJO DE DATOS (SSOT)

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                  CAPA 1: INGENIERÍA 3D & CATÁLOGOS (INMUTABLE)                    │
│  • solar-engine.js (Simulación 8760h / 288h)   • modules-breakdown.js (Multi-Mod) │
│  • bom-tree.js (Metrado paramétrico real)      • structure-catalog.js (Tarifas)   │
│  • bill-auditor.js (Auditoría Factura 2.0/3.0) • company-branding.js (Marca/Tema) │
└─────────────────────────────────────────┬─────────────────────────────────────────┘
                                          │
                                          ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│        CAPA 2: MOTOR FINANCIERO & PRESUPUESTARIO ÚNICO (SSOT: financials.js)      │
│  • RAPricing.computeDesignCosts() -> { panelPrice, panelTotalCost, estPrice,      │
│    invPrice, mlpePrice, batPrice, cabPrice, dcProtPrice, acProtPrice, moPrice,    │
│    legPrice, icioTaxEur, directCostTotal }                                        │
│  • RAPricing.getCommercialConfig() -> { marginPct, hideMarginInClientDocs,        │
│    discountType, discountValue, customAddons[], paymentMilestones[],              │
│    taxShieldConfig: { irpfPct, ibiPct, ibiYears, icioBonifPct } }                 │
│  • calculateFinancialModel() -> Objeto Canónico Único (window._lastFinModel)      │
└───────────────┬─────────────────────────────────┬─────────────────────────────────┘
                │                                 │
                ▼                                 ▼
┌───────────────────────────────────────┐ ┌─────────────────────────────────────────┐
│   CAPA 3: UI INTERACTIVA (PASO 5)     │ │   CAPA 4: GENERADORES EDITORIALES PDF   │
│  • Panel Lateral (#step-5)            │ │  • Oferta Bancable Portrait (3 Hojas)   │
│  • Centro de Mando Comercial (Modal   │ │  • Dossier Ejecutivo Landscape (5-10 p) │
│    Unificado con 4 Pestañas)          │ │  • Presupuesto BOE & Memoria Técnica    │
│  • Comparador 3 Paquetes (Good/Bet/B) │ │  • Pack ZIP Completo (HTML + SVG + DXF) │
└───────────────────────────────────────┘ └─────────────────────────────────────────┘
```

---

## 🚀 FASE 1 (HITO 1): SANEAMIENTO DE LA FUENTE ÚNICA DE LA VERDAD (SSOT) Y RECONCILIACIÓN MATEMÁTICA

### 1.1. Objetivo Técnico
Eliminar las **6 discrepancias de CAPEX**, las **4 fórmulas contradictorias de autoconsumo/ahorro**, la **doble contabilidad de optimizadores (MLPE)**, el **descuento fantasma del ICIO** y los **bugs de unidades** en el Paso 5. Todos los consumidores deben leer un único resultado canónico.

### 1.2. Archivos Afectados y Especificación Exacta de Cambios

#### A. `js/bom-tree.js` — Topología de Microinversores y Desglose de Impuestos
1. **Respeto a Topología Microinversor (`computeBOMTree`, líneas ~420–455):**
   - **Problema actual:** `tree.electrical.inverters` presupuesta siempre un inversor central aunque `cfg.selectedTopology === 'microinverter'` o `tree.electrical.microinverters.count > 0`.
   - **Solución:** Si `isMicroinverter === true` (es decir, `tree.electrical.microinverters && tree.electrical.microinverters.count > 0`), establecer `tree.electrical.inverters = []` y su coste a `0 €`, asignando todo el coste de conversión AC/DC a `tree.electrical.microinverters.totalCostEur`.
2. **Separación de Coste Técnico (PEC) vs. Tasas Municipales (ICIO / Fianzas) (`computeBOMTree`, líneas ~595–618):**
   - **Problema actual:** `tree.summary.subtotalEur` suma el `ICIO (3.5%)` dentro del coste directo, mientras `financials.js` lo filtra, provocando que el precio del Árbol BIM nunca coincida con el Coste Directo del Paso 5.
   - **Solución:** Exponer en `tree.summary`:
     - `tree.summary.pecDirectCostEur`: Suma estricta de materiales, estructura, equipos eléctricos, mano de obra e ingeniería/legalización (excluyendo ICIO).
     - `tree.summary.municipalTaxesEur`: Importe del ICIO y tasas municipales.
     - `tree.summary.subtotalEur`: Igualar a `pecDirectCostEur` y mostrar `municipalTaxesEur` como línea informativa separada en la tarjeta del Árbol BIM (`"Tasas Municipales / ICIO est.: X €"`).
3. **Exposición Desglosada de Cables vs. Cuadros en `tree.electrical`:**
   - Añadir `tree.electrical.cablesTotalEur` y `tree.electrical.panelsProtTotalEur` para que `docs-generator.js` no tenga que inventar el reparto `40% / 60%`.

#### B. `js/financials.js` — Motor `RAPricing` y `calculateFinancialModel()`
1. **Ampliación del contrato de `RAPricing.computeDesignCosts(numPanels)` (líneas ~312–412):**
   - Separar explícitamente el coste de inversores (`invBasePrice`) del coste de optimizadores/microinversores (`mlpeTotalCost`).
   - Devolver el objeto canónico completo:
     ```javascript
     return {
       numPanels: nPanels,
       panelPrice: Math.round(unitPanelPrice * 100) / 100,
       panelTotalCost: Math.round(totalPanelsCost),
       estPrice: Math.round(estPrice),
       invPrice: Math.round(invOnlyPrice),       // SOLO inversor(es) o microinversores
       mlpePrice: Math.round(mlpeOnlyPrice),     // SOLO optimizadores DC
       batPrice: Math.round(batPrice),
       cabPrice: Math.round(cabPrice),           // Cables DC + AC + Tierra + MC4 + Tubo + Cuadros DC/AC
       cablesOnlyPrice: Math.round(cablesOnly),  // Solo conductores y canalización
       protOnlyPrice: Math.round(protOnly),      // Solo cuadros DC + AC
       moPrice: Math.round(moPrice),
       legPrice: Math.round(legPrice),
       icioTaxEur: Math.round(icioTaxEur),
       directCostTotal: Math.round(totalPanelsCost + estPrice + invOnlyPrice + mlpeOnlyPrice + batPrice + cabPrice + moPrice + legPrice)
     };
     ```
2. **Eliminación de Doble Contabilidad de MLPE y Machaque de Inversor en `calculateFinancialModel()` (líneas ~1606–1665):**
   - **Problema actual:** Las líneas 1616–1619 sobrescriben `inv = _invSel.price * _invCount` ignorando microinversores y overrides manuales del modal; y la línea 1659 vuelve a sumar `mlpeCost` cuando ya venía incluido en `designCosts.invPrice`.
   - **Solución:**
     - Si el usuario NO ha forzado un override manual en sesión (`!hasActiveSessionOverride`), tomar `inv = designCosts.invPrice` y `mlpeCost = designCosts.mlpePrice`.
     - Si la topología activa es `microinverter`, `inv` debe ser `designCosts.invPrice` (que ya contiene `microinverters.totalCostEur`) y `mlpeCost = 0`.
     - En `wpOpenPricingReviewModal()` (`recalcPreview`, líneas ~552–559 y `recalculateLive`, líneas ~741–775), incluir `mlpeCost` y usar `designCosts.panelTotalCost` cuando haya configuración multimódulo (`mb.isMultiModule`), garantizando que el **Total Llave en Mano** del modal coincida **al céntimo** con `calculateFinancialModel()`.
3. **Corrección Contable del ICIO (`financials.js`, líneas ~1684 y ~1924):**
   - **Problema actual:** Se calcula `ahorroICIO = tasaICIO * (bonifICIO / 100)` y se resta de `capexBruto` en la línea 1924, aunque `tasaICIO` no estaba incluida en `capexBruto`.
   - **Solución:**
     - `capexDesembolsoInicial` en el Año 0 es `capexBruto - subvencionDirecta` (sin restar `ahorroICIO` del precio del instalador, o bien sumando `tasaICIO` al desembolso total de obra+tasas y restando `(tasaICIO - ahorroICIO)`).
     - Exponer `m.ahorroTotal25 = Math.round(annualSavings25.reduce((a, b) => a + b, 0))` y `m.pctAutoconsumo = m.autarquiaPct` (alias de compatibilidad para líneas 106 y 183).
4. **Desacople del Consumo Anual de la Vivienda respecto al número de paneles (`financials.js`, línea ~1720):**
   - **Problema actual:** `Math.max(annualYieldKWh * 0.75, 3500)` hace que al añadir paneles en el tejado suba mágicamente el consumo eléctrico de la vivienda.
   - **Solución:** Si no hay factura cargada en `billAuditor` ni consumo manual fijado por el usuario en `window.solarProjectConfig.manualAnnualConsumptionKWh`, usar un consumo base determinista según tipología/tarifa (`4500 kWh/año` para `2.0TD` residencial, `18000 kWh/año` para `3.0TD` industrial), **nunca dependiente de `annualYieldKWh`**, permitiendo además editar dicho consumo desde el Paso 5.

#### C. `index.html`, `js/engineering-explainer.js` y `js/bill-auditor.js` — Sincronización de Controles y Unidades
1. **Bug de Euros mostrados como kWh en `#fin-tou-info` (`index.html`, líneas ~5679–5685):**
   - **Problema actual:** `var _redKwh = Math.round(m.costeRedAnual || 0);` imprime euros como `'Red: X kWh'`.
   - **Solución:** Calcular `var _redKwh = Math.max(0, Math.round((m.consumoAnualKWh || 0) - (m.autoconsumoDirectoAnual || 0) - (m.autoconsumoBateriaAnual || 0)));` y mostrar opcionalmente al lado `(' + Math.round(m.costeRedAnual || 0) + ' €/año)'`.
2. **Sincronización de `getProjectCalcs()` (`index.html`, líneas ~12180–12255):**
   - Eliminar la partida fantasma `pres_mon = 200`.
   - Invocar o leer el modelo canónico de `calculateFinancialModel()` para que `d.subtotal`, `d.iva`, `d.total_pres` (y alias `d.total`), `d.ahorro_anual` y `d.payback` (y alias `d.roi`) sean **100% idénticos** a los del motor financiero (incluyendo margen comercial e IVA).
3. **Sincronización del Comparador de Escenarios (`wpCompararEscenarios` en `index.html`, líneas ~3775–3820):**
   - En lugar de leer inputs ocultos con defaults `350 + 1400 + 500` sin batería, sin margen y sin IVA, calcular el CAPEX de cada escenario invocando la estructura de costes reales de `RAPricing` + `marginPct` + `21% IVA` + batería si aplica.
4. **Eliminación del Payback fijo `"4.2 años"` en `js/engineering-explainer.js` (líneas ~285–295):**
   - Conectar `generateExecutiveSummaryHTML(d)` con `window._lastFinModel` (o `calculateFinancialModel()`) para leer `ahorroAnual`, `paybackYears`, `co2Tons` y `treesEquivalent` reales.
5. **Unificación del Factor de CO₂ y Árboles Equivalentes (Constante Canónica Global):**
   - Definir en un único punto (`window.RA_ENV_FACTORS = { kgCo2PerKwh: 0.26, treesPerTonCo2: 45 }`) y consumirlo idénticamente en `index.html`, `financials.js`, `commercial-proposal-dossier.js` y `engineering-explainer.js`.
6. **Corrección de Impuesto Eléctrico en `js/bill-auditor.js` (`computeComparison`, línea ~657):**
   - Incluir el Impuesto Eléctrico (`5.11269632%`) antes de aplicar el `21% de IVA` al ahorro anual estimado cuando la factura original incluye IE, igualando la fiscalidad con el resto del auditor.

### 1.3. Protocolo de Validación Visual y Numérica — Hito 1 (Checklist)
- [ ] **Test 1.1 (Unicidad de CAPEX):** Con un diseño de 10 paneles + inversor + batería, verificar que el **Subtotal (Base Imponible)** y el **Total con IVA** son exactamente iguales al euro en:
  1. Tarjeta `CAPEX Estimado` del panel izquierdo del Paso 5 (`#fin-capex`).
  2. Modal de `Ajustar Precios & Margen` (`#pricing-preview-total`).
  3. Oferta Bancable Portrait (Página 2/3).
  4. Dossier Ejecutivo Landscape (Portada y Lámina 7).
  5. Presupuesto Detallado BOE y Memoria Técnica (`docs-generator.js`).
- [ ] **Test 1.2 (Optimizadores y Microinversores):** Activar optimizadores y comprobar que solo se suman una vez. Cambiar a microinversores y verificar en el Árbol BIM que desaparece el inversor central.
- [ ] **Test 1.3 (Unidades de Red y Payback):** Verificar en `#fin-tou-info` que `Autoconsumo kWh + Red kWh = Consumo Total kWh` y que el Resumen Ejecutivo del Paso 5 muestra el Payback real (no `"4.2 años"`).

---

## 🎨 FASE 2 (HITO 2): AUDITORÍA DE DISEÑO GRÁFICO, CSS EDITORIAL, OCULTACIÓN DE MARGEN E IMPRESIÓN A4 PERFECTA

### 2.1. Objetivo Técnico
Corregir todos los fallos visuales, de CSS, paginación A4 e impresión en los 3 documentos generados, **ocultar por defecto el margen comercial del instalador en los PDFs de cliente**, y conectar las tablas y gráficas vectoriales SVG del Dossier Landscape a los datos reales del motor horario.

### 2.2. Archivos Afectados y Especificación Exacta de Cambios

#### A. `js/financials.js` — Oferta Bancable Portrait (3 Páginas A4)
1. **Confidencialidad de Márgenes Comerciales (líneas ~1320–1420):**
   - **Problema actual:** El PDF del cliente muestra `Coste Directo de Materiales (Base)` y debajo `Margen de Ingeniería y Gestión (20%): X €`, además de saltar al `TOTAL CON IVA` sin fila de `Base Imponible` ni fila de `IVA (21%)`.
   - **Solución:**
     - Por defecto (`hideMarginInClientDocs = true`), multiplicar el importe de cada capítulo del presupuesto del cliente por `marginFactor = 1 + (marginPct / 100)` (ajustando por redondeo la última partida para que la suma de las filas cuadre al céntimo con `m.subtotal`).
     - Eliminar del PDF del cliente las filas que delatan el coste directo y el porcentaje de margen.
     - Añadir al pie de la tabla las 3 filas contables canónicas:
       1. **`BASE IMPONIBLE (Total Instalado Llave en Mano)`**: `m.subtotal €`
       2. **`IVA Aplicable (21%)`** (o el `%` configurado): `m.iva €`
       3. **`TOTAL PRESUPUESTO (IVA Incluido)`**: `m.capexBruto €`
2. **Reestructuración Editorial de las 3 Páginas A4 y Reglas `@page` (líneas ~1012–1470):**
   - Añadir al `<style>` del documento:
     ```css
     @page { size: A4 portrait; margin: 10mm; }
     *, *::before, *::after {
       -webkit-print-color-adjust: exact !important;
       print-color-adjust: exact !important;
       color-adjust: exact !important;
     }
     ```
   - **Reordenación psicológica de páginas (sin desbordamiento vertical):**
     - **Página 1 (Impacto Ejecutivo y Diseño 3D):** Cabecera corporativa + Datos Cliente/Proyecto + Captura 3D / Mapa de Calor + 6 KPIs grandes de alto impacto (Potencia, Producción, Ahorro Año 1, Payback, Autarquía, Reducción de Factura) + Resumen Ejecutivo IA + Presupuesto por Capítulos con Base Imponible, IVA y Total.
     - **Página 2 (Producción Horaria/Mensual, Garantías y Contraste de Factura):** Histograma Mensual + Comparativa Factura Actual vs. Factura Solar + Sellos Visuales de Garantías (Módulos 25a, Inversor 10a, Estructura 15a, Estanqueidad) + Condiciones de Pago y Firma.
     - **Página 3 (Anexo Financiero Bancable a 25 Años):** Curva SVG de Amortización Acumulada + Tabla completa de Flujos de Caja a 25 años (25 filas compactas con `padding: 3.5px 6px; font-size: 9.5px` que encajan holgadamente en 1 sola página A4 sin partir filas).
3. **Corrección del Bug de Interpolación en Logo Tipográfico (línea ~1102):**
   - Sustituir `.join('<span style="color:${pal.accent}">⚡</span>')` por ``.join(`<span style="color:${pal.accent}">⚡</span>`)``.
4. **Sincronización de Estado Legal (`borrador` / `orientativa` / `vinculante` / `aprobada`) (línea ~1254):**
   - Mapear correctamente los 4 estados:
     - `borrador` -> `"BORRADOR / ESTIMACIÓN NO VINCULANTE"` (color ámbar `#f59e0b`)
     - `orientativa` -> `"OFERTA COMERCIAL ORIENTATIVA"` (color azul `#0284c7`)
     - `vinculante` -> `"OFERTA TÉCNICO-COMERCIAL VINCULANTE"` (color primario)
     - `aprobada` -> `"PROPUESTA APROBADA / CONTRATO"` (color esmeralda `#10b981`)

#### B. `js/commercial-proposal-dossier.js` — Dossier Ejecutivo A4 Landscape (10 Láminas)
1. **Conexión Real de la Tabla CAPEX en Lámina 7 (líneas ~188–207 y ~1310–1370):**
   - Usar `designCosts.directCostTotal` (ahora existente desde la Fase 1) y `designCosts.panelTotalCost`.
   - Multiplicar cada partida por el `marginFactor` para que la suma de importes de la tabla sea exactamente igual a `totalCost` (Base Imponible).
   - **Si el proyecto tiene batería (`batKwh > 0` o `designCosts.batPrice > 0`)**, insertar dinámicamente la fila **`02b. Sistema de Almacenamiento LFP (Baterías)`** con su modelo, capacidad en kWh, peso porcentual e importe real.
2. **Conexión Real de la Tabla Mensual (Lámina 5) y Gráficas SVG (Láminas 6 y 9):**
   - **Tabla Mensual (líneas ~151–177):** Consumir el desglose mensual real del motor horario (`financials.js`), reflejando el aumento real de cobertura solar cuando hay batería instalada.
   - **Gráfica de Curva Horaria Diaria (`Charts.dailyCurve`, líneas ~326–375):** Reemplazar los vectores estáticos fijos por los perfiles horarios reales de generación FV, consumo del cliente y ventana de **carga/descarga de batería nocturna** (pintando un área diferenciada verde esmeralda por la tarde/noche cuando `batKwh > 0`).
   - **Gráfica de Amortización a 25 Años (`Charts.amortization25`, líneas ~378–418):** Reemplazar la escalera lineal ficticia (`hPct = y / 25`) por el vector real `fin.cashflowAcum` (o `annualSavings25`), dibujando la línea cero (`0 €`), las barras negativas en rojo/ámbar antes del año de Payback y las barras positivas en el color corporativo tras cruzar el punto de equilibrio.
3. **Corrección de Numeración de Láminas, Imágenes y Guard de Inicialización:**
   - Corregir el encabezado de la Lámina 10: cambiar `"10. Formalización contractual"` (que saltaba del `08.` al `10.`) por **`"09. Formalización contractual"`** (o numerar dinámicamente según las láminas activas).
   - En la Portada (Lámina 1) y Lámina 4: si existe captura del plano técnico/mapa de calor distinta a la vista en perspectiva, usar la vista 3D general en Portada y el plano técnico cenital en la Lámina 4.
   - Añadir guard de idempotencia `if (this._initialized) return; this._initialized = true;` al inicio de `DossierWYSIWYG.init()` (línea ~2090).
   - Sincronizar los parámetros macroeconómicos impresos en el pie de la Lámina 9 (IPC eléctrico y degradación anual) con los valores reales usados por `calculateFinancialModel()`.

#### C. `js/docs-generator.js` — Presupuesto Detallado BOE, Memoria Técnica y Pack ZIP
1. **Eliminación de Doble `.doc-sheet` e Inyección de CSS Completo (`generatePresupuesto`, líneas ~113–180 y ~926–1046):**
   - Quitar el wrapper `<div class="doc-sheet">` duplicado de la línea 927 en `generatePresupuesto()`.
   - Añadir en el `<style>` de `docWindow()` todas las clases huérfanas: `.doc-header`, `.doc-header-left`, `.doc-logo-box`, `.doc-logo-icon`, `.doc-logo-title`, `.doc-logo-sub`, `.doc-header-right`, `.doc-meta-item`, `.doc-section-title`, `.doc-box`, `.doc-grid-3`, `.doc-grid-span2`, `.doc-grid-4`, `.kpi-card`, `.kpi-val`, `.kpi-lbl`, `.doc-table`, `.doc-footer`, más `@page { size: A4 portrait; margin: 12mm; }` y `print-color-adjust: exact`.
2. **Desglose Real de Partidas en `generatePresupuesto()` (líneas ~795–915):**
   - Corregir `totalMetrosAC`: usar la longitud real de línea `lAcReal` en metros de manguera tetrapolar/pentapolar (sin multiplicarla por 3 o 5 conductores).
   - Usar `cablesOnlyPrice` y `protOnlyPrice` reales del BOM en las partidas `4.1` y `4.2` (eliminando el reparto arbitrario `40% / 60%`).
   - Aplicar el factor de margen comercial proporcional a los precios unitarios del presupuesto del cliente para que el Subtotal del Presupuesto BOE coincida al céntimo con la Oferta Comercial.
3. **Veracidad Normativa en la Memoria Técnica (`generateMemoria`, líneas ~638–644):**
   - Sustituir el peso fijo `"13,8 kg/m²"` por el peso real máximo calculado en `BOMTreeEngine.computeBOMTree()` (`maxWeightPerSqmKg`). Si la cubierta es lastrada, mostrar el límite correspondiente y el estado real (`✓ Conforme` o `⚠️ Requiere verificación de forjado`).
   - Evaluar dinámicamente con condicionales reales las comprobaciones de `Voc_str_cold <= V_max_inv`, `Isc <= I_max_mppt` y caída de tensión AC/DC.
   - Corregir en `getProjectCalcs()` (`index.html`, línea ~12386) `R_tierra: 800` por `R_tierra: 15` (`≤ 37 Ω` según REBT ITC-BT-18).
4. **Pack de Entrega ZIP Completo (`exportPackEntregaZip`, líneas ~2340–2430):**
   - Incluir realmente dentro del archivo `.zip`:
     - `01_Memoria_Tecnica_Diseño.html`
     - `02_Propuesta_Comercial_Bancable.html`
     - `03_Presupuesto_Detallado_Mediciones.html`
     - `04_Esquema_Unifilar.svg` y `04_Esquema_Unifilar.dxf`
     - `00_Indice_Expediente_Tecnico.txt`

#### D. `index.html` y `js/company-branding.js` — Sincronización de Paletas de Color
1. En `#modal-cfg-proposal-theme` (`index.html`, línea ~2774), estandarizar las 5 opciones con las claves exactas de `THEMES` (`emerald`, `sky`, `amber`, `slate`, `rose`) y añadir alias `THEMES.blue = THEMES.sky` en `financials.js` y `commercial-proposal-dossier.js` para retrocompatibilidad.

### 2.3. Protocolo de Validación Visual — Hito 2 (Checklist)
- [ ] **Test 2.1 (Margen Oculto):** Abrir la Oferta Comercial Portrait y el Presupuesto BOE; verificar que NO aparece ninguna fila llamada `"Margen de Ingeniería (20%)"` y que sí aparecen `Base Imponible`, `IVA (21%)` y `Total con IVA`.
- [ ] **Test 2.2 (Vista Previa de Impresión `Ctrl+P`):** Pulsar Imprimir en los 3 documentos (Oferta Portrait, Dossier Landscape y Presupuesto BOE); verificar que los fondos de color se mantienen nítidos y ninguna tabla se corta dejando filas huérfanas.
- [ ] **Test 2.3 (Gráficas Reactivas del Dossier):** Generar el Dossier Landscape sin batería y luego con batería; comprobar que en la Lámina 7 aparece la partida de la batería, en la Lámina 5 sube la cobertura solar, en la Lámina 6 cambia la curva horaria y en la Lámina 9 la gráfica de amortización empieza en negativo y cruza el cero en el año del Payback.

---

## 🛠️ FASE 3 (HITO 3): MOTOR COMERCIAL DE PERSONALIZACIÓN (DESCUENTOS, EXTRAS "QUITA Y PON", 3 PAQUETES, ESCUDO FISCAL E HITOS)

### 3.1. Objetivo Técnico
Dotar al motor `RAPricing` (`js/financials.js`) de capacidades comerciales de alta conversión totalmente modulares y reactivas, sin romper ningún contrato existente.

### 3.2. Especificación Técnica del Nuevo Estado Comercial (`RAPricing.commercialState`)

Añadir en `RAPricing` (persistido en `sessionStorage` / `localStorage` bajo `ra_commercial_custom_config`) el siguiente esquema:

```javascript
const DEFAULT_COMMERCIAL_CONFIG = {
  // 1. Visibilidad de márgenes y desglose
  hideMarginInClientDocs: true,      // Reparte el margen en las partidas (true por defecto)
  showUnitPricesInClientDocs: true,  // Permite ocultar precios unitarios y mostrar solo el total

  // 2. Descuento Comercial ("Cierra-Ventas" con Precio Tachado)
  discountEnabled: false,
  discountLabel: 'Descuento Especial Firma en 15 días',
  discountType: 'percent',           // 'percent' | 'fixed_eur'
  discountValue: 5,                  // ej. 5% o 600 €

  // 3. Partidas Extra / Opcionales de "Quita y Pon" (Add-ons)
  addons: [
    { id: 'ev_charger',   enabled: false, name: 'Cargador Vehículo Eléctrico Wallbox 7,4 kW + Protecciones', qty: 1, unitPrice: 890 },
    { id: 'bird_mesh',    enabled: false, name: 'Sistema Perimetral Antipájaros en Cubierta (Malla UV)',    qty: 1, unitPrice: 320 },
    { id: 'virtual_bat',  enabled: false, name: 'Alta y Configuración de Batería Virtual (Hucha Solar)',     qty: 1, unitPrice: 95 },
    { id: 'lifeline',     enabled: false, name: 'Línea de Vida Homologada EN 795 / Medios de Elevación',     qty: 1, unitPrice: 450 },
    { id: 'maint_annual', enabled: false, name: 'Pack Mantenimiento Preventivo y Limpieza Anual (Año 1)',    qty: 1, unitPrice: 180 }
  ],
  customAddons: [],                  // Array libre: [{ id, enabled, name, qty, unitPrice }]

  // 4. Escudo Fiscal Español (Subvenciones y Deducciones)
  taxShield: {
    irpfEnabled: true,
    irpfPct: 40,                     // 20% | 40% | 60% (Deducción Estatal IRPF Rehabilitación Energética)
    irpfMaxBaseEur: 7500,            // Base máxima legal deducible (5.000€ / 7.500€ / 15.000€)
    ibiEnabled: true,
    ibiAnualEur: 600,                // Recibo anual estimado de IBI del cliente
    ibiBonifPct: 50,                 // % bonificación ordenanza municipal (ej. 50%)
    ibiYears: 3,                     // Años de bonificación (ej. 3 a 5 años)
    icioBonifPct: 95                 // % bonificación ICIO municipal
  },

  // 5. Financiación y Hitos de Pago Configurables
  financing: {
    loanTinPct: 5.50,                // TIN anual %
    loanMonths: 84,                  // Plazo en meses (60, 84, 120, 180)
    milestones: [
      { label: 'Reserva e Ingeniería (a la firma)', pct: 20 },
      { label: 'Acopio de Equipos e Inicio de Montaje', pct: 50 },
      { label: 'Puesta en Marcha y Legalización', pct: 30 }
    ]
  },

  // 6. Comparativa Comercial de 3 Paquetes (Good / Better / Best)
  showThreePackagesComparison: true,

  // 7. Selector Modular de Láminas en Dossier (Modo Residencial vs Industrial)
  dossierMode: 'full',               // 'residential_5' (5 láminas ágiles) | 'full' (10 láminas) | 'custom'
  activeSlides: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
};
```

### 3.3. Reglas Matemáticas de Propagación
1. **Cálculo de Subtotal con Extras y Descuento:**
   - `addonsTotalCost = sum(addon.qty * addon.unitPrice)` para todos los `addons` y `customAddons` con `enabled === true`.
   - `subtotalAntesDescuento = (directCostTotal + addonsTotalCost) * (1 + marginPct / 100)`.
   - Si `discountEnabled === true`:
     - `discountEur = discountType === 'percent' ? subtotalAntesDescuento * (discountValue / 100) : discountValue`.
     - `subtotalNeto = Math.max(0, subtotalAntesDescuento - discountEur)`.
     - `capexSinDescuentoConIva = subtotalAntesDescuento * (1 + ivaPct / 100)` (para mostrar **Precio Tachado**).
2. **Cálculo del Escudo Fiscal ("Lo que te cuesta de verdad"):**
   - `deduccionIRPF = irpfEnabled ? Math.min(capexBruto, irpfMaxBaseEur) * (irpfPct / 100) : 0`.
   - `bonificacionIBITotal = ibiEnabled ? (ibiAnualEur * (ibiBonifPct / 100) * ibiYears) : 0`.
   - `costeRealNetoTrasImpuestos = Math.max(0, capexBruto - subvencionDirecta - deduccionIRPF - bonificacionIBITotal)`.
   - `paybackConEscudoFiscal = costeRealNetoTrasImpuestos / ahorroAnualAno1`.
3. **Generador Automático de los 3 Paquetes ("Esencial / Óptimo / Independencia Total"):**
   - Función `RAPricing.computeThreePackages(finModel)`:
     - **Paquete 1 — Esencial (Ahorro Diurno):** El diseño actual sin batería ni optimizadores, ajustado al consumo base diurno.
     - **Paquete 2 — Óptimo Recomendado ⭐ (Tu Diseño 3D Actual):** Exactamente el proyecto configurado en el visor con todos sus equipos seleccionados.
     - **Paquete 3 — Independencia Total (Batería Inteligente + Extras):** Si el diseño actual no tiene batería, simula automáticamente añadir una batería LFP dimensionada (`Math.max(5, Math.round(kwp * 1.2)) kWh`) elevando la autarquía al `80–90%`; si ya tiene batería, añade ampliación o pack de protección/cargador VE.

### 3.4. Protocolo de Validación Visual — Hito 3 (Checklist)
- [ ] **Test 3.1 (Extras y Descuento con Precio Tachado):** Activar el extra *"Cargador Vehículo Eléctrico (890 €)"* y un descuento del *5%*; verificar que ambos aparecen desglosados en la tabla del presupuesto, que aparece el precio original tachado junto al precio final bonificado y que el Payback se recalcula al instante.
- [ ] **Test 3.2 (Hitos de Pago y Financiación):** Cambiar los hitos a `50% / 50%` y el préstamo a `120 meses al 4,9% TIN`; verificar que tanto la Oferta Portrait como las Láminas 8 y 10 del Dossier muestran exactamente esos porcentajes, importes y cuota mensual.

---

## 💡 FASE 4 (HITO 4): CONTENIDO TÉCNICO VISUAL "PARA HUMANOS" (INFOGRAFÍAS DE ALTA CONVERSIÓN)

### 4.1. Objetivo Técnico
Sustituir el exceso de jerga árida por **4 componentes infográficos vectoriales (SVG/HTML auto-contenidos)** que traduzcan la ingeniería real del proyecto a beneficios tangibles e inmediatos para un cliente no ingeniero.

### 4.2. Especificación de los 4 Bloques Visuales (En `financials.js` y `commercial-proposal-dossier.js`)

1. **Infografía 1: "El Cara a Cara de tu Bolsillo" (Factura Vieja vs. Nueva Factura + Cuota Financiada):**
   - Gráfico de barras comparativo horizontal/vertical de alto contraste:
     - 🔴 **Barra Roja (Hoy sin placas):** `Gasto Mensual Actual (ej. 185 €/mes)` — *"Dinero perdido al 100% en alquiler de energía"*.
     - 🟢 **Barra Esmeralda (Con tu Tejado Solar al contado):** `Nuevo Recibo Reducido (ej. 28 €/mes)` — **Ahorro directo: `-85%`**.
     - 🔵 **Barra Azul (Financiado sin entrada):** `Nuevo Recibo (28 €) + Cuota Solar (79 €) = 107 €/mes` — Badge destacado: ***"¡Te sobran +78 €/mes en el bolsillo desde el Día 1 sin poner un euro de entrada!"***.
2. **Infografía 2: "El Reloj Solar de 24 Horas de tu Tejado" (Mañana 🌅 / Mediodía ☀️ / Noche 🌙):**
   - Infografía visual dividida en 3 franjas horarias conectadas a los datos reales de `m.autoconsumoDirectoAnual`, `m.autoconsumoBateriaAnual` y `m.excedentesAnual`:
     - **08:00–11:00 (Despertar Solar):** Tus placas despiertan y cubren los primeros consumos de la mañana.
     - **11:00–17:00 (Plena Potencia Gratis):** Tu casa/empresa funciona **100% gratis con el sol** (`X kWh/día`). Lo que te sobra llena tu Batería LFP o tu Hucha Virtual (`Y kWh/día`).
     - **17:00–08:00 (Noche Inteligente):** Consumiendo la energía solar guardada por la tarde (o descontando en euros los excedentes vertidos al mediodía).
3. **Infografía 3: "Anatomía de tu Tejado Blindado (Cero Goteras y Máxima Seguridad)" + Semáforo de Garantías:**
   - Grid visual de 4 escudos técnicos explicados en lenguaje llano pero riguroso:
     - 🛡️ **Estanqueidad Triple Junta EPDM:** Fijación estructural sin apoyar sobre la teja, resistente a dilataciones térmicas y lluvias torrenciales.
     - 💨 **Cálculo Estructural contra Vendavales (CTE):** Perfilería de aluminio anodizado / lastrado dimensionado para vientos de hasta `120 km/h` (`Peso real: X kg/m²`).
     - ⚡ **Doble Escudo contra Sobretensiones y Rayos:** Cuadros de protección DC/AC independientes con descargadores de sobretensión y cableado anti-bucle inductivo.
     - 🏆 **Línea de Tiempo Visual de Garantías:** Barras de progreso comparativas: **25 Años** Garantía de Producción Lineal · **15 Años** Garantía de Producto en Paneles · **10 Años** en Inversor/Batería · **Garantía Total de Instalación y Estanqueidad**.
4. **Infografía 4: "La Cascada del Escudo Fiscal" (Lo que pagas vs. Lo que te devuelve Hacienda y el Ayuntamiento):**
   - Diagrama visual en cascada (*Waterfall*) con 4 escalones:
     `Inversión Llave en Mano (IVA inc.)` ➔ `− Bonificación IBI Municipal (3-5 años)` ➔ `− Deducción Estatal IRPF (20%-60%)` ➔ **`= COSTE REAL NETO DE BOLSILLO`** + **`Retorno Real Acelerado: X,X años`**.

### 4.3. Protocolo de Validación Visual — Hito 4 (Checklist)
- [ ] **Test 4.1 (Legibilidad en 5 Segundos):** Abrir la Oferta Comercial y el Dossier Ejecutivo; verificar que las 4 infografías se renderizan con iconos vectoriales SVG limpios, colores corporativos sincronizados con el tema elegido y cifras 100% dinámicas del proyecto actual.
- [ ] **Test 4.2 (Coherencia con/sin Batería):** Comprobar que el "Reloj Solar de 24 Horas" adapta automáticamente su texto e icono nocturno según si el proyecto tiene batería física LFP o compensación de excedentes/batería virtual.

---

## 🎛️ FASE 5 (HITO 5): UNIFICACIÓN UI/UX — "CENTRO DE MANDO COMERCIAL" Y SIMPLIFICACIÓN DEL PASO 5

### 5.1. Objetivo Técnico
Eliminar la saturación cognitiva del panel lateral del Paso 5 y consolidar los **4 modales dispersos** (`ra-pricing-review-modal`, `ra-cost-breakdown-modal`, `ra-company-branding-modal`, `ra-dossier-config-modal`) en una **única experiencia modular con pestañas**, manteniendo retrocompatibilidad total con las funciones globales existentes.

### 5.2. Archivos Afectados y Especificación Exacta de Cambios

#### A. Consolidación en el "Centro de Mando Comercial y Presupuesto" (Modal Único con 4 Pestañas)
- Crear/actualizar en `js/financials.js` (conectado con `company-branding.js` y `commercial-proposal-dossier.js`) un modal unificado con cabecera fija de resumen en vivo (`Base Imponible` · `Descuento` · `Total con IVA` · `Margen €/%` · `Payback`) y **4 Pestañas**:
  1. **💰 Pestaña 1 — Costes, Extras y Descuento:**
     - Costes técnicos del BOM (Paneles, Estructura, Inversor, Batería, Cableado/Protecciones, Mano de Obra, Ingeniería).
     - Margen comercial (`%`) + Switch `Ocultar margen en documentos del cliente`.
     - Checkboxes de **Extras "Quita y Pon"** + botón `+ Añadir Partida Personalizada`.
     - **Descuento Cierra-Ventas** (`%` o `€` fijo) con vista previa del precio tachado.
  2. **🏦 Pestaña 2 — Financiación, Escudo Fiscal y Pagos:**
     - Configuración de Préstamo (TIN `%`, plazo en meses) y Renting.
     - Configuración del **Escudo Fiscal** (IRPF `20% / 40% / 60%`, IBI anual y años de bonificación, ICIO).
     - Editor de **Hitos de Pago** (3 hitos cuyos porcentajes suman `100%`).
  3. **👤 Pestaña 3 — Cliente, Factura y Fotografías del Proyecto:**
     - Datos del Titular/Cliente (Nombre, NIF/CIF, Dirección, Municipio, Provincia, CUPS, Consumo anual manual si no hay factura).
     - Sincronización bidireccional instantánea entre el Dossier, la Oferta Portrait y la Memoria Técnica (rellenar el cliente en un sitio lo actualiza en todos).
     - Selector/previsualización de las capturas 3D (Vista Perspectiva, Planta Técnica, Mapa de Calor) o subida de foto real.
  4. **🎨 Pestaña 4 — Marca Corporativa y Formato de Salida:**
     - Logo de empresa, Razón Social, CIF, Teléfono, Email, Web, Eslogan, Estado de la oferta (`Borrador`, `Orientativa`, `Vinculante`, `Aprobada`).
     - Selector visual de las **5 Paletas de Color** (`Esmeralda`, `Azul Cielo`, `Ámbar`, `Pizarra`, `Rosa Corporativo`).
     - Selector de **Modo del Dossier**: `⚡ Modo Residencial Ágil (5 Láminas)` vs. `🏢 Modo Ejecutivo Completo (10 Láminas)` con checkboxes por lámina.

#### B. Limpieza del Sidebar del Paso 5 (`index.html`, líneas ~1924–2045)
- Eliminar la animación infinita `pulseGlow` que distrae al usuario.
- Eliminar controles huérfanos rotos (`updateStructureCost` y `updateBatteryCost` que apuntaban a IDs inexistentes).
- Organizar las acciones del Paso 5 en una jerarquía limpia de 3 niveles:
  1. **Botón Principal de Configuración:** `⚙️ PERSONALIZAR PRESUPUESTO, EXTRAS Y MARCA` (abre el Centro de Mando Comercial).
  2. **Botones de Emisión Comercial:**
     - `✨ GENERAR DOSSIER EJECUTIVO (A4 HORIZONTAL)`
     - `📄 GENERAR OFERTA BANCABLE (A4 VERTICAL)`
  3. **Botones de Ingeniería Oficial:**
     - `📑 MEMORIA TÉCNICA` · `📋 PRESUPUESTO BOE` · `📦 DESCARGAR PACK COMPLETO (.ZIP)`

### 5.3. Protocolo de Validación Visual — Hito 5 (Checklist)
- [ ] **Test 5.1 (Sincronización Total desde un Único Modal):** Cambiar el nombre del cliente, el logo, el tema de color a `Azul`, añadir un extra y pulsar Guardar; verificar que los cambios se reflejan simultáneamente en el Dossier Landscape, la Oferta Portrait y el Presupuesto BOE sin abrir ninguna otra ventana.
- [ ] **Test 5.2 (Modo Residencial de 5 Láminas):** Seleccionar en la Pestaña 4 el preset `Modo Residencial Ágil (5 Láminas)`, generar el Dossier y comprobar que solo se renderizan las 5 láminas clave con su numeración consecutiva (`01.` a `04.` + Portada) sin saltos.
- [ ] **Test 5.3 (Descarga ZIP Completa):** Pulsar `📦 Descargar Pack (.ZIP)` y verificar que el archivo comprimido contiene los 5 documentos prometidos listos para entregar al cliente o a la distribuidora.
