# REPARACIÓN QUIRÚRGICA — Registro de ejecución (2026-10-28)

> Bitácora viva de las correcciones derivadas de `AUDITORIA_QUIRURGICA_RA_2026-10-27.md`.
> Cada entrada dice **qué se cambió**, **dónde** y **cómo se verificó**. Lo pendiente va al final, con motivo.

| Campo | Valor |
| :--- | :--- |
| Base de partida | `91d241f` (auditoría) → árbol actualizado por terceros hasta `f75a627` |
| Commit de reparación | `8f7938d` — *fix(audit): ola 0-1 de reparación quirúrgica* |
| Gate | **35/35 tests en verde** (`node tests/run-all.js`) |
| Inline `index.html` | 5 bloques compilan (`new Function` sobre el HTML) |
| Alcance cerrado | 18 hallazgos completos + 4 parciales |

---

## 1. Lo que ya está arreglado (verificado)

### 1.1 Integridad documental y económica

| ID | Cambio | Archivo | Prueba |
| :--- | :--- | :--- | :--- |
| **A-01** | El VAN se imprime con su signo; sin modelo → `N/D`. Eliminada la rama que lo positivizaba con `Math.max(0, ahorro25 − coste·1,12)`. | `js/commercial-proposal-dossier.js` (`computeVanLabel`) | `test-document-integrity` (VAN −8.000 €, 0 €, NaN, null) |
| **A-02** | Partida de módulos = `panelTotalCost × escala`; el residual ya no se disfraza de "permisos". Función pura `computeCapexBreakdown`. | `js/commercial-proposal-dossier.js` | `test-document-integrity` (suma de capítulos = total; módulos ≈ 22,8 %) |
| **A-03** | TIR/VAN/payback/LCOE de relleno (`16.4`, `4.2`, `×2.8`, `×15.6`) sustituidos por `N/D` + banner rojo "DOCUMENTO EMITIDO SIN MODELO FINANCIERO". | `js/docs-generator.js` | `test-document-integrity` (grep de constantes + textos) |
| **A-05** | CEL apagada por defecto (`includeCEL: false` en las 3 rutas), sin afirmar "certificada CEL-Ready"; el texto se condiciona a verificación jurídica. | `js/financials.js` | `test-cel-opportunity` (sin activar no se menciona; activada usa el texto condicionado) |
| **A-08** | El resumen comercial deriva `kWp` de nº módulos × Wp y omite la frase si no hay dato; nunca "0.00 kWp". | `js/financials.js` (`generateCommercialSummary`) | `test-cel-opportunity` (ya no aparece 0,00 kWp) |

### 1.2 Seguridad y plataforma

| ID | Cambio | Archivo | Prueba |
| :--- | :--- | :--- | :--- |
| **B-01** | Allowlist de extensiones/archivos, denegación de `functions/`, `tests/`, `doc/`, `.md`, `server.js`, `package.json`…; bind a `127.0.0.1` salvo `--lan`. | `server.js` | `test-server-hardening` |
| **B-02** | `decodeURIComponent` con `try/catch`, rechazo de `%00`, 400 controlado y `clientError`. Ya no tumba el proceso. | `server.js` | `test-server-hardening` (`/%zz`, `/%00`) |
| **B-03** | `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, CSP mínima; 404 sin reflejar la URL; `Content-Length` + `HEAD`. | `server.js` | `test-server-hardening` |
| **B-04** | Credenciales fuera del repo: `js/ra-env.js` (ignorado) + `js/ra-env.example.js`; `config.js`, `viewer.js` y `firebase-service.js` leen `window.RA_ENV`. Aviso claro si faltan. | `js/config.js`, `js/viewer.js`, `js/firebase-service.js`, `.gitignore` | `test-no-secrets` (0 literales en archivos versionados) |
| **B-05** | Firestore: eliminada la rama `isPublic` (lectura anónima); `update` no puede cambiar `ownerId`/`tenantId`; helpers `isOwner/isTenantMember/isAdmin`. | `firestore.rules` | `test-security-contract` |
| **B-06** | Cliente escribe `ownerId` en raíz (no solo en `meta`), exige sesión, valida propiedad al cargar y no lista sin usuario; IDs UUID. | `js/firebase-service.js` | `test-security-contract` |
| **B-07** | Storage: límite 10 MB + MIME permitido; lectura de `branding` ya no es anónima. | `storage.rules` | `test-security-contract` |
| **B-08** | Sanitizador por allowlist (`RASanitize.richText`) para la salida de Gemini, el resumen guardado y los toasts (escape de título/mensaje). | `js/sanitizer.js`, `js/financials.js`, `js/ui-viewport-controls.js` | `test-document-integrity` (sanitizador) |

### 1.3 Ingeniería eléctrica y física solar

| ID | Cambio | Archivo | Prueba |
| :--- | :--- | :--- | :--- |
| **C-01** | La copia inline de límites MPPT: normaliza β en %/°C (antes `−0.29` se trataba como fracción y multiplicaba la tensión ×10), usa **βVmp** (no γPmp) y respeta alias (`vDcMax`, `vMpptMin`, `tMinCold`…). | `index.html` (~8930-8970) | `test-mppt-parity` (Ns_max/Ns_min idénticos al módulo) |
| **C-03** | ρ(T) = ρ20·(1+α·(T−20)), acotada 20–90 °C; antes usaba ρ a 20 °C para cualquier T < 90 °C (subestimaba ΔV ~19 %). | `js/electrical-engine.js` | `test-ra-full-workflow` + `test-phase4-electrical-audit` |
| **C-04** | Diferencial Tipo B por defecto; Tipo A-SI solo con RCMU acreditado (`inv.rcmu`). | `js/electrical-engine.js` | `test-ra-full-workflow` (ambos casos) |
| **C-06** | Docstring de ventana térmica corregido a −10…+70 °C. | `js/electrical-engine.js` | — |
| **D-03** | El PR ya no se recorta a [0,60–0,90]: devuelve el valor real y `prWarning` si sale de rango. | `js/solar-engine.js` | `test-loss-monotonicity` (verde) |
| **D-07** | Un solo factor de CO₂ (0,259 kg/kWh) en memoria, oferta, explicador y dossier; el dossier calcula kWh × factor, no kWp × 0,42. | `js/financials.js`, `js/engineering-explainer.js`, `js/commercial-proposal-dossier.js` | `test-docs-generator-ssot`, `test-document-integrity` |

### 1.4 Eólico

| ID | Cambio | Archivo | Prueba |
| :--- | :--- | :--- | :--- |
| **E-01** | Validación física por equipo: `Cp(v) = P / (0,5·ρ·A·v³) ≤ 0,593` (Betz). Cada turbina lleva `cpAudit` con `maxCp`, puntos infractores y motivo; se avisa por consola al cargar. | `js/wind/wind-catalog.js` | `test-wind-cp` |

> **Resultado de la auditoría del catálogo:** los **6 equipos por defecto** incumplen Betz (Cp entre 0,655 y 2,165). El validador ya lo detecta y bloquea la publicación silenciosa; **los datos siguen pendientes de sustituir por datasheets reales**.

### 1.5 QA y arnés de pruebas

| ID | Cambio | Verificación |
| :--- | :--- | :--- |
| **A-06** | Runner `tests/run-all.js`: descubre todos los `test-*.js`, ejecuta en procesos aislados con timeout, agrega resultados y devuelve exit 1 solo al final. `npm test` ya no aborta en el primer fallo. | 35 tests ejecutados |
| **F-02 (parcial)** | Mock de Cesium corregido (`UNIT_X/Y/Z`, `negate`, `fromRadians`, `Transforms`); contrato de invalidación incremental actualizado al diseño vigente (commit `87015c9`). | `test-building-rect`, `test-incremental-faldon-render` |
| — | Dos defectos reales encontrados al arreglar los tests: **(1)** ocultar un faldón no ocultaba sus paneles (XSS no, visibilidad sí); **(2)** `wpUpdateLayoutFastMetrics` forzaba el recálculo solar completo en Paso 2, rompiendo el Lazy Evaluation. Ambos corregidos. | `test-hidden-objects-selection`, `test-lazy-evaluation` |

---

## 2. Decisiones tomadas (documentadas para no re-litigar)

1. **CEL**: se deja como hipótesis opcional, desactivada, y el texto pasa a "podría monetizarse… sujeto a verificación jurídica". No se elimina la funcionalidad, se desactiva la promesa.
2. **RCD**: se prioriza seguridad sobre comodidad: sin RCMU acreditado → Tipo B. Si el catálogo no trae el dato, el informe pedirá Tipo B (más caro, correcto).
3. **Credenciales**: se acepta que `js/ra-env.js` no se versione. **Las claves actuales deben rotarse** (han estado en git); el repo ya no las contiene.
4. **CP del catálogo eólico**: no se inventan curvas nuevas. Se marcan como inválidas y se bloquea su uso silencioso hasta tener datasheet.
5. **Invalidación incremental**: se respeta el diseño del commit `87015c9` (preservar movimientos manuales) y se actualiza el test, en vez de revertirlo.

---

## 3. Lo que queda pendiente (y por qué)

### 3.1 Requiere decisión humana (no la toma una IA)

| ID | Asunto | Estado |
| :--- | :--- | :--- |
| **A-04** | Base de inversión contractual: CAPEX bruto vs neto tras IBI/IRPF; sobre cuál se publica TIR/payback | Pendiente. Mientras: los flujos siguen sobre bruto y la oferta muestra "inversión neta"; hay que etiquetar la base. |
| **A-05 (fuente)** | Referencia normativa publicable para la CEL (BOE/URL) | Pendiente de dictamen jurídico. |
| **E-03** | ¿Se implementa geotecnia completa o se retira la palabra "segura"? | Pendiente. Recomendación: retirar hasta tener estudio. |

### 3.2 Trabajo técnico pendiente (sin bloqueo)

| ID | Asunto | Nota |
| :--- | :--- | :--- |
| **A-07** | Dos cifras de ahorro (auditoría vs modelo) | Conciliar en una sola; requiere decidir base fiscal. |
| **B-03 (resto)** | `ignore` de `firebase.json` publica `server.js` y reglas | Añadir entradas al `ignore`. |
| **B-09** | Cloud Function `gwaProxy`: App Check, rate limit, allowlist, sin `details` | Requiere desplegar y probar con token. |
| **C-02** | Límites ΔV 1,5/1,5 vs global 2,5 | Documentar como regla AND o unificar a 3,0; afecta veredictos. |
| **C-05** | Tablas de secciones/ampacidad duplicadas (inline vs módulo) | Extraer a una sola fuente. |
| **D-01** | Producción canónica desde datos del emplazamiento (NASA/PVGIS con memoización) | El cambio más profundo; requiere snapshot dorado. |
| **D-02** | Factor POA mensual con geometría real | Depende de D-01. |
| **D-04/D-05** | Excentricidad orbital en Erbs; rango de kt | Mejora fina del motor. |
| **D-06** | Precio de reserva 0,14 vs 0,18 €/kWh | Sustituir por el precio del modelo. |
| **D-08** | Reparto mensual con `monthlySource` visible | Marcar estimación vs simulación. |
| **E-02** | Flicker: paso diario y ventana solar real | `stepDays = 5` sigue. |
| **E-03** | Estructura eólica: e ≤ L/6, portante, pandeo, fatiga | No implementado. |
| **E-04** | Serie 8760 sintética | Etiquetar como estimación. |
| **F-01** | Reducir el monolito (16.252 líneas inline) | Por dominios, con delegados; trabajo continuo. |
| **F-03** | ESLint + CI | Pendiente. |
| **F-04** | Regenerar inventario de módulos en `AGENTS.md`/`doc/02` | Pendiente. |
| **F-05/F-06** | Contratos de dependencia y observabilidad | Pendiente. |

---

## 4. Cómo verificar el estado actual

```powershell
cd C:\TRABAJOS\RA\RA
node tests/run-all.js        # 35/35 verde, exit 0
node tests/test-js-syntax.js # 61 módulos OK
git log --oneline -3
```

Pruebas nuevas que blindan lo reparado:

| Archivo | Cubre |
| :--- | :--- |
| `test-document-integrity.js` | A-01, A-02, A-03, A-05, B-08 |
| `test-no-secrets.js` | B-04 |
| `test-security-contract.js` | B-05, B-06, B-07, B-01/B-03 (estático) |
| `test-server-hardening.js` | B-01, B-02, B-03 (proceso real) |
| `test-mppt-parity.js` | C-01 |
| `test-wind-cp.js` | E-01 |
| `run-all.js` | A-06 |

---

## 5. Riesgos residuales tras esta ola

1. **Las claves siguen siendo las mismas** hasta que se roten en Google Cloud / Cesium. El repo ya no las expone, pero el historial sí.
2. **El catálogo eólico sigue siendo físicamente imposible**; ahora se detecta, pero cualquier AEP calculado con esos datos sigue siendo inválido.
3. **La producción canónica sigue usando la tabla fija** (`SOLAR_RAD`) cuando no hay simulación; el número es el mismo que antes de esta ola.
4. **No se ha desplegado nada**: reglas Firestore/Storage y Cloud Functions requieren `firebase deploy` y prueba con emulador.
5. **El árbol cambió durante la auditoría**: otro proceso añadió 4 commits (`e5fc52d`…`f75a627`). Conviene congelar rama antes de la siguiente ola para evitar conflictos.

---

*Registro vivo. Próxima ola: C-02/C-05, D-01/D-02, A-04/A-07 y el endurecimiento de `functions/`.*
