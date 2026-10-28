# REPARACIÓN QUIRÚRGICA — Registro de ejecución (2026-10-28)

> Bitácora viva de las correcciones derivadas de `AUDITORIA_QUIRURGICA_RA_2026-10-27.md`.
> Cada entrada dice **qué se cambió**, **dónde** y **cómo se verificó**.

| Campo | Valor |
| :--- | :--- |
| Base de partida | `91d241f` (auditoría) → árbol actualizado por terceros hasta `f75a627` |
| Olas ejecutadas | **Ola 0-1** (`8f7938d`) · **Ola 2** (`f4c1a92`) |
| Gate | **42/42 tests en verde** (`node tests/run-all.js`) |
| Inline `index.html` | 5 bloques compilan (`new Function` sobre el HTML) |

---

## 1. Ola 0-1 — contención, seguridad y verdad documental

### 1.1 Integridad documental y económica

| ID | Cambio | Archivo | Prueba |
| :--- | :--- | :--- | :--- |
| **A-01** | El VAN se imprime con su signo; sin modelo → `N/D`. Eliminada la rama que lo positivizaba. | `js/commercial-proposal-dossier.js` | `test-document-integrity` |
| **A-02** | Partida de módulos = `panelTotalCost × escala`; suma de capítulos cierra. | `js/commercial-proposal-dossier.js` | `test-document-integrity` |
| **A-03** | TIR/VAN/payback/LCOE de relleno → `N/D` + banner de aviso. | `js/docs-generator.js` | `test-document-integrity` |
| **A-05** | CEL apagada por defecto; sin afirmar certificación; texto condicionado. | `js/financials.js` | `test-cel-opportunity` |
| **A-08** | El resumen no imprime «0.00 kWp»; deriva kWp del diseño. | `js/financials.js` | `test-cel-opportunity` |

### 1.2 Seguridad y plataforma

| ID | Cambio | Prueba |
| :--- | :--- | :--- |
| **B-01…B-03, B-10** | Servidor con allowlist, loopback, cabeceras, CORS local, 400 controlado, proxy GWA con timeout/tope/allowlist. | `test-server-hardening` |
| **B-04** | Credenciales fuera del repo (`js/ra-env.js` ignorado + plantilla). | `test-no-secrets` |
| **B-05/B-06/B-07** | Firestore/Storage cerrados; `ownerId` raíz; límites de subida. | `test-security-contract` |
| **B-08** | Sanitizador por allowlist para IA y toasts. | `test-document-integrity` |

### 1.3 Ingeniería y QA

C-01 (coeficientes MPPT inline), C-03 (ρ(T)), C-04 (RCD Tipo B), C-06, D-03 (PR sin clamp), D-07 (CO₂ único), E-01 (Betz), A-06 (runner), arnés de Cesium y dos bugs reales (paneles ocultos, recálculo en Paso 2).

---

## 2. Ola 2 — criterio eléctrico, producción y eólico

### 2.1 Eléctrico

| ID | Cambio | Archivo | Prueba |
| :--- | :--- | :--- | :--- |
| **C-02** | ΔV en dos niveles explícitos: tramo ≤ 1,5 % **y** total ≤ 2,5 % (AND), con bandera `tramosExcedenTotal` para el caso 1,4+1,4. Atribución normativa corregida (ya no se atribuye el 1,5 % a la ITC-BT-40). | `js/electrical-engine.js`, `js/cable-engine.js` | `test-electrical-contract` |
| **C-05** | Tabla única de secciones/ampacidad en el motor; el inline la consume (`RA.Electrical.SECCIONES`) con respaldo mínimo. | `js/electrical-engine.js`, `index.html` | `test-electrical-contract` |

### 2.2 Producción solar

| ID | Cambio | Archivo | Prueba |
| :--- | :--- | :--- | :--- |
| **D-01** | La producción canónica declara su fuente y prioriza: simulación por panel → motor físico con GHI del emplazamiento (memoizado) → tabla estacional. El campo `productionSource` viaja en `getProjectCalcs()` y se imprime en la memoria. | `index.html`, `js/docs-generator.js` | `test-production-source` |
| **D-02** | El motor físico calcula POA con geometría mensual real (declinación y hora solar por mes) en lugar del sol fijo a 50°. | `js/solar-engine.js` | `test-production-source` (julio ≫ enero) |
| **D-06** | Sin modelo financiero no se inventa ahorro (`0` y payback «—»); se elimina el 0,14 €/kWh de reserva. | `index.html` | `test-production-source` |

### 2.3 Base de inversión y ahorros (A-04/A-07)

- El modelo exporta `inversionBaseMetricas = capexBruto`.
- La tabla fiscal separa **inversión neta** (informativa) y **desembolso inicial (base de TIR y payback)**, con nota explicativa.
- La memoria etiqueta TIR y payback como «sobre desembolso inicial (CAPEX bruto)».
- La hoja de factura distingue **AHORRO S/ FACTURA (auditoría)** y **Ahorro s/ modelo energético (SSOT)** con nota de por qué difieren.

### 2.4 Eólico

| ID | Cambio | Archivo | Prueba |
| :--- | :--- | :--- | :--- |
| **E-01** | (Ola 1) Validación de Betz + `cpAudit` por equipo. | `js/wind/wind-catalog.js` | `test-wind-cp` |
| **E-02** | Flicker: muestreo **diario** (antes 1 de cada 5) y ventana 03:00-22:00 UTC (antes 06-20). | `js/wind/wind-shadow-flicker.js` | — (cálculo) |
| **E-03** | Dictamen estructural: sin presión admisible **no puede ser "segura"**; publica excentricidad, L/6 y riesgo de despegue; `requiresGeotechnicalStudy`. | `js/wind/wind-structural.js` | `test-wind-structural` |
| **E-04** | El despacho híbrido declara `seriesSource: 'synthetic-monthly-profile'` y un aviso: no es un año meteorológico real. | `js/wind/wind-hybrid-dispatch.js` | — |

> **Dato nuevo de E-03:** en el caso por defecto (Bornay 25.3, H=18 m) la resultante cae en **e = 0,83 m > L/6 = 0,62 m**, es decir, la zapata despega. El código anterior la declaraba segura.

### 2.5 Plataforma

- **B-03 (resto)**: `firebase.json` excluye `server.js`, reglas, `package.json`, `js/ra-env.js` y añade cabeceras de seguridad (nosniff, DENY, CSP mínima, HSTS, Permissions-Policy).
- **B-09**: `gwaProxy` con CORS restringido, rate limit 30/min por IP, allowlist de host, timeout, tope de tamaño, topes de estructura en el parser y errores genéricos. Runtime actualizado a Node 22.

### 2.7 Ola 4 — precisión de radiación y contrato de carga

| ID | Cambio | Archivo | Prueba |
| :--- | :--- | :--- | :--- |
| **D-04** | Erbs corrige la excentricidad orbital: `I0(n) = 1367·(1 + 0,033·cos(360·n/365))`. Se propaga el día del año por `decomposeErbs → poa → computePOAIrradiance → runPhysicalModel / heatmap / worker`. Efecto: ±6,8 % estacional en `kt` para la misma GHI. | `js/radiation-engine.js`, `js/solar-engine.js`, `js/solar-heatmap.js`, `js/solar-worker.js` | `test-radiation-accuracy` |
| **D-05** | `kt` deja de recortarse a [0,1–0,85]; ahora es [0–1], coherente con el modelo Erbs. | `js/radiation-engine.js`, `js/solar-engine.js` | `test-radiation-accuracy` |
| **F-05** | Contrato de cableado: todos los `<script>` existen, orden crítico congelado (ra-env→config, radiation→heatmap, electrical→cable/dossier), 63 archivos sin huérfanos y workers referenciados. | — | `test-module-wiring` |

> Nota: la corrección de excentricidad **no rompe** la coherencia mensual (julio sigue muy por encima de enero) pero sí ajusta el reparto difusa/directa un ~7 % en los extremos del año.

### 2.8 Ola 3 — trazabilidad mensual, documentación y CI

| ID | Cambio | Archivo |
| :--- | :--- | :--- |
| **D-08** | El modelo declara `monthlySource` (`simulation` / `fallback-weights`) y la memoria lo imprime junto a la fuente de producción. | `js/financials.js`, `js/docs-generator.js` |
| **F-04** | Inventario real actualizado: 63 archivos JS (50 + 13 eólicos), `package.json` existente, `sanitizer.js` y `js/wind/` documentados; corregida la afirmación «no existe package.json». | `AGENTS.md`, `doc/02-tecnologia.md` |
| **F-03 (parcial)** | Workflow de CI sin dependencias (`.github/workflows/tests.yml`): sintaxis, batería completa, secretos y servidor. Pendiente ESLint formal. | `.github/workflows/tests.yml` |

### 2.9 Ola 5 — observabilidad y trinquete del monolito

| ID | Cambio | Archivo | Prueba |
| :--- | :--- | :--- | :--- |
| **F-06** | `RA_ErrorHandler` guarda un buffer circular (50) con contexto (proyecto, paso, mensaje, stack), engancha `error` y `unhandledrejection`, y expone `RAErrors.report()/exportJSON()/download()`. | `js/error-handler.js` | `test-error-observability` |
| **F-01 (parcial)** | 1) La resolución de producción sale del inline a `js/production-source.js` (prioridad + memoización), con respaldo local si el módulo no carga. 2) Eliminada la declaración muerta duplicada de `wpStartGridMeterPlacement` (la segunda ganaba por hoisting). 3) Nuevo **trinquete**: el inline no puede crecer (techo 16.414 líneas, 237 funciones, 0 duplicados, 16 nombres compartidos). | `index.html`, `js/production-source.js` | `test-inline-ratchet`, `test-production-source`, `test-module-wiring` |

> **Balance honesto del inline:** partía de 16.252 líneas y está en 16.413. El neto sube por los bloques de seguridad añadidos (producción trazable, `N/D`, comprobaciones), pero el trinquete impide que siga creciendo y ya no hay funciones duplicadas. A partir de aquí, todo lo nuevo va a módulos.

---

## 3. Decisiones tomadas (documentadas)

1. **CEL**: hipótesis opcional, desactivada, condicionada a verificación jurídica.
2. **RCD**: seguridad primero; Tipo B salvo RCMU acreditado.
3. **Credenciales**: `js/ra-env.js` fuera de git. **Rotar las claves actuales** (siguen en el historial).
4. **Catálogo eólico**: no se inventan curvas; se marcan inválidas (6/6 incumplen Betz) y se bloquea el dictamen "seguro".
5. **ΔV**: regla AND 1,5 % por tramo / 2,5 % total, declarada como criterio de proyecto.
6. **Producción**: simulación > motor físico > tabla, con la fuente impresa en el documento.

---

## 4. Pendiente

### 4.1 Requiere decisión humana

| ID | Asunto |
| :--- | :--- |
| **A-04** | Confirmar contractualmente la base (bruto vs neto). Ya está etiquetada, pero la decisión es de negocio. |
| **A-05** | Referencia normativa publicable de la CEL. |
| **E-03** | ¿Geotecnia completa o mantener "predimensionamiento"? Hoy el sistema ya no dice "seguro". |

### 4.2 Técnico

| ID | Asunto |
| :--- | :--- |
| **D-04/D-05** | Excentricidad orbital en Erbs y rango de `kt`. |
| **E-01 (datos)** | Sustituir las 6 curvas por datasheets reales; hoy solo se detectan. |
| **F-01** | Reducir el monolito (16.252 líneas inline). |
| **F-03** | ESLint formal (hoy CI + guardas propias). |
| **F-05/F-06** | Contratos de dependencia y observabilidad. |
| **B-09 (App Check)** | Requiere token de cliente y despliegue. |

---

## 5. Verificación

```powershell
cd C:\TRABAJOS\RA\RA
node tests/run-all.js        # 42/42, exit 0
node tests/test-js-syntax.js # 61 módulos OK
git log --oneline -3
```

Pruebas nuevas de esta ola: `test-electrical-contract`, `test-production-source`, `test-wind-structural`.

---

## 6. Riesgos residuales

1. Claves sin rotar (histórico de git).
2. Curvas eólicas inválidas: el AEP sigue siendo alto si se usa el catálogo tal cual; ahora se detecta y el dictamen estructural se degrada.
3. Reglas y Functions **no desplegadas** ni probadas con emulador.
4. El árbol puede seguir cambiando por otro proceso; congelar rama antes de la siguiente ola.

---

*Registro vivo. Próxima ola: D-08, F-03/F-04 y limpieza del monolito por dominios.*
