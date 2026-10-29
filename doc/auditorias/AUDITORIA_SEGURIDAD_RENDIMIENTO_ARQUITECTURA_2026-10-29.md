# 🛡️ AUDITORÍA INTEGRAL: SEGURIDAD, RENDIMIENTO, ARQUITECTURA Y PERMISOS

> **Proyecto:** RA — Visor Solar 3D (`ra-solar-3d`)
> **Fecha:** 29/10/2026
> **Alcance:** Stack completo — `server.js` (Node nativo), `functions/index.js` (Cloud Functions v2), Firebase (Hosting/Firestore/Storage/Auth), cliente Vanilla JS (CesiumJS/WebGL, monolito `index.html` + 63 módulos `js/`), batería de tests y CI.
> **Método:** Revisión de código estática + forense de historial Git + verificación en vivo de producción + revisión de reglas de seguridad y pipeline de despliegue.
> **Nota:** Esta auditoría es complementaria a la ola `AUD-2026` (commit `8f7938d`), que ya validó y blindó el servidor estático, el proxy GWA y las reglas de Firestore/Storage. Aquí se listan los hallazgos **restantes observados el 29/10/2026**, verificados primero.

---

## ⚠️ 0. RESUMEN EJECUTIVO (léelo antes de seguir)

Existe una **fuga de credenciales activa y confirmada en producción**:

```
$ curl https://ra-solar-3d.web.app/js/ra-env.js        ← HTTP 200 HOY MISMO
window.RA_ENV = {
  googleMaps: 'AIzaSy...QWA',      ← clave de Google Maps pública y sin verificar restricciones
  cesiumIon:  'eyJhbGciOi...SwqVk', ← token Cesium ion (JWT) público
  firebase:   { apiKey: 'AIzaSy...', ... }
}
```

**Estado:** `js/ra-env.js` pasa el guardia de git (está en `.gitignore` y el test `test-no-secrets.js` lo valida)… pero **nadie le dijo lo mismo a Firebase Hosting**. El `firebase.json` de hosting **no excluye** ese archivo, y el caché de despliegue `.firebase/hosting..cache` (línea 15) confirma que entró en el upload del despliegue del 27/10/2026. Si las claves de Google Maps y/o Cesium ion no están **restringidas por referrer/API/cuota** en sus consolas correspondientes, cualquier bot puede vaciar la cuota de facturación del proyecto. Además, esas **mismas claves están en el histórico de Git** (fue `js/config.js` en al menos 6 commits: `f3a2dc5`, `2c62930`, `81ca039`, `5facbde`, `5909768`, `c02868b`), lo que confirma que **deben rotarse** aunque se limpien los repos.

El resto de la batería está sorprendentemente sano (ver Anexo A: crédito a la ola previa). Los hallazgos restantes giran en torno a 3 críticos/altos principales y una cola de medios y bajos de higiene.

---

## 1. TABLA RESUMEN DE HALLAZGOS

| ID | Sev. | Hallazgo | Ubicación | Riesgo principal |
|:---|:-----|:---------|:----------|:-----------------|
| SEC-01 | 🔴 **CRÍTICO** | Credenciales servidas por Hosting en producción | `js/ra-env.js` + `firebase.json` (hosting.ignore) + `.firebase/hosting..cache` | Vaciamiento de cuota de facturación (Maps/ion), abuso de recursos, colecta por bots |
| SEC-02 | 🔴 **CRÍTICO** | Claves en el histórico de Git | commits `f3a2dc5`→`c02868b` (`js/config.js`, `js/bill-auditor.js`, `js/firebase-service.js`) | Claves comprometidas; cualquier clon del repo las recupera |
| SEC-03 | 🟠 **ALTO** | El servidor estático sirve `js/ra-env.js` (y con `--lan`, a toda la red local) | `server.js` → `DENIED_FILES` (líneas 183–186) | Fuga de claves en equipo; el test de hardening no cubre este caso |
| SEC-04 | 🟠 **ALTO** | Sumidero `innerHTML` **sin sanitizar** para texto de IA | `js/financials.js:619` (`container.innerHTML = generatedText`) | Prompt injection → XSS en origen de la app → robo de claves de `localStorage` |
| SEC-05 | 🟡 **MEDIO** | Importación de `.raproject` sin validación de esquema ni filtrado anti `__proto__` | `js/project-storage.js` (`Object.assign` en líneas 988, 1074, 1146) | Prototype pollution / config poisoning desde archivo ajeno (vector .raproject "regalado") |
| SEC-06 | 🟡 **MEDIO** | Clave de Maps usada en query `?key=` contra Web Services desde el navegador | `js/viewer.js:431, 694` | Las WS (Geocoding/Elevation) **no admiten restricción por referrer**: solo por IP (imposible en cliente). Clave en logs/URL; probable fallo CORS silencioso |
| SEC-07 | 🟡 **MEDIO** | Sin **App Check** en Firebase (auth no basta contra clientes headless) | `js/firebase-service.js`, `firestore.rules`, `storage.rules` | Scraping masivo con la config web pública desde scripts sin navegador |
| PERF-01 | 🟡 **MEDIO** | Monolito de 958 KB / 15.260 líneas / 77 `<script>` | `index.html` | Parseo/carga pesados; HTML con `no-cache` → descarga completa en cada visita; sin Service Worker |
| ARC-01 | 🟡 **MEDIO** | Parser GWA duplicado, y la copia local pierde los topes anti-DoS | `server.js:39–105` vs `functions/index.js:25–103` | Desalineación de hardening (la copia server no valida rangos de cabecera); deuda DRY |
| SEC-08 | 🟡 **MEDIO** | `server.js` `/api/gwa` sin rate-limit (solo la Cloud Function lo tiene) | `server.js:253–263` | Abuso de proxy local cuando se arranca con `--lan` |
| ARC-02 | 🟡 **MEDIO** | ~240 asignaciones `innerHTML` como patrón dominante de render | todo el cliente | Superficie XSS estructural: el saneado existe pero es *opt-in*, no *por defecto* |
| QUA-01 | 🟢 **BAJO** | `'use strict'` duplicado en cabecera | `js/config.js:3–4` | Ruido / descuido de linter |
| QUA-02 | 🟢 **BAJO** | Tipado ausente: `var` mezclado con `let/const` sin JSDoc consistente | p. ej. `js/financials.js` | Errores de runtime en producción; refactor peligroso |
| QUA-03 | 🟢 **BAJO** | Scripts codemod (`patch_*`/`fix_*`) dispersos en la carpeta padre del repo | `C:\TRABAJOS\RA\` (21 archivos) | Higiene de repositorio; riesgo de re-ejecutar parches ya aplicados |
| SEC-09 | 🟢 **BAJO** | Firestore `equipment_catalog` con `allow read: if true` y doc `users` auto-escritable sin field-validation | `firestore.rules:43–51` | Enumeración anónima de catálogos (aceptable si es público por diseño: documentarlo) |
| PERM-01 | 🟢 **BAJO** | `storage.rules` /branding: lectura por cualquier usuario autenticado (no solo del dueño) | `storage.rules:35–38` | Fuga menor de logos corporativos entre tenant |

> ⚠️ No hay SQL en este proyecto (Firestore), por lo que no aplica inyección SQL; el equivalente —inyección de consultas/filtros— no está presente ya que todas las consultas se construyen con claves fijas en `firebase-service.js`.

---

## 2. HALLAZGOS EN DETALLE

### 🔴 SEC-01 — Credenciales publicadas en producción (CRÍTICO)

**Descripción.** `firebase.json` (bloque `hosting.ignore`) excluye `server.js`, `package.json`… pero **no `js/ra-env.js`**. El test `test-no-secrets.js` opera solo sobre el árbol git, no sobre el pipeline de hosting. Resultado: el archivo con credenciales reales se traslada al bucket público de Hosting. **Verificado hoy:**

```bash
curl https://ra-solar-3d.web.app/js/ra-env.js   # → 200 OK, JSON con claves
```

**Ubicación:** `firebase.json` (hosting.ignore), `.firebase/hosting..cache:15`, `js/ra-env.js`.

**Riesgo.**
- Google Maps: si la clave no está restringida por HTTP referrer + restricción de API + cuota: vaciamiento de la cuota de facturación (las Web Services solo admiten restricción por IP → una clave de WS embebida en el navegador es insensible al referrer y vulnerable por diseño).
- Cesium ion: destrucción del token por abuso (conlleva caída del visor para los usuarios legítimos).
- El archivo queda indexable por rastreadores automáticos de secretos (escanean dominios públicos constantemente).

**Solución recomendada (el orden IMPORTA — ver Plan de Acción Fase 0):**

1. **Primero rotar/crear**: generar token ion nuevo + clave Maps nueva **con restricciones**; actualizar `js/ra-env.js` local.
2. **Redesplegar** (`firebase deploy --only hosting`) **antes** de revocar las viejas (para que la prod nunca quede sin visor).
3. Confirmar por `curl` que la copia pública ya contiene las claves nuevas restringidas → revocar las antiguas.
4. A medio plazo: inyección en tiempo de build (CI sustituye placeholder desde Secret Manager) y añadir `js/ra-env.js` al `ignore` de hosting de forma permanente, de modo que un escaneo estático no encuentre un archivo de claves servido tal cual.

> Nota técnica honesta: en una SPA las claves de Maps/ion **siempre viajan al navegador** (`window.RA_CONFIG_KEYS`). El objetivo real no es "esconderlas" —es imposible— sino (a) que estén **restringidas y con cuota**, y (b) que no vivan en un archivo estático apetitoso para scrapers.

---

### 🔴 SEC-02 — Claves en el histórico de Git (CRÍTICO)

**Descripción.** `git log -S "AIzaSy" --all` revela que los literales actuales (idénticos a `js/ra-env.js`) vivieron en archivos versionados en al menos seis commits (`f3a2dc5`, `2c62930`, `81ca039`, `5facbde`, `5909768`, `c02868b`), incluyendo `js/config.js` con ambas claves (Maps + ion) tal cual están hoy en el env.

**Ubicación:** historial Git (`js/config.js`, `js/bill-auditor.js`, `js/firebase-service.js` en las revisiones indicadas).

**Riesgo.** Si el repo se publica/clona en el futuro, las claves vuelven a estar grabadas ahí para cualquiera que recorra el historial. La regla del propio `ra-env.example.js` lo dice claro: *si una clave ha estado en git, considérala comprometida*.

**Solución recomendada.**
1. **Rotación de claves** (la única mitigación verdadera): hacerla en Fase 0 junto a SEC-01.
2. Limpieza de historial con Git BFG / `git filter-repo` (comandos en el Plan de Acción) + push forzado coordinado.
3. Habilitar **GitHub Secret Scanning + Push Protection** si el repo sube a GitHub (ya hay workflow en `.github/workflows/`).

---

### 🟠 SEC-03 — `server.js` sirve las credenciales locales (ALTO)

**Descripción.** La allowlist de extensiones de `server.js` permite `.js`, y `DENIED_FILES` no incluye `ra-env.js`. Con `GET /js/ra-env.js` el servidor responde **200 con las credenciales**. Escucha en loopback por defecto (bien), pero el flag `--lan` (existe, línea 188) expone el servidor a toda la red local.

**Ubicación:** `server.js:175–186` (`ALLOWED_EXT`, `DENIED_FILES`), más concretamente lo que **no está** en `DENIED_FILES`.

**Riesgo.** En ordenador de oficina con `--lan` + wifi corporativo: fuga de claves a cualquier dispositivo de la red. Además el test `test-server-hardening.js` **no prueba esta ruta**, por lo que el hueco es invisible para CI.

**Solución (código propuesto, server.js):**

```js
const DENIED_FILES = new Set([
  'server.js', 'package.json', 'package-lock.json', 'firebase.json',
  'firestore.rules', 'storage.rules', 'firestore.indexes.json', '.firebaserc',
  'ra-env.js', 'ra-env.example.js'   // ← NUEVO: credenciales y plantilla, nunca http-servibles
]);
```

**Y en `tests/test-server-hardening.js`, añadir al bucle de denegados:**

```js
for (const denied of [
  '/server.js', '/functions/index.js', '/tests/test-js-syntax.js', '/.gitignore',
  '/package.json', '/js/ra-env.js'   // ← NUEVO
]) { ... }
```

---

### 🟠 SEC-04 — Sumidero XSS sin sanitizar para texto de IA (ALTO)

**Descripción.** El proyecto tiene su propio sanitizador por allowlist (`js/sanitizer.js`) y casi todas las rutas IA lo usan (`financials.js:598`, `:2179`, `:2220–2223`). Pero hay **una ruta viva que salta el control**: la respuesta de Gemini de `requestCommercialSummaryFromGemini()` se inyecta a pelo:

```js
var generatedText = await requestCommercialSummaryFromGemini(d, m, equipment);
if (generatedText && generatedText.trim()) {
  container.innerHTML = generatedText;   // ← financials.js:619 — SIN RASanitize
```

**Ubicación:** `js/financials.js:617–621` (el patrón correcto coexiste con la única ruta que lo salta).

**Riesgo.** El texto de Gemini es texto **no confiable** (las facturas/datos del proyecto son vectores de *prompt injection*: el propio comentario de `sanitizer.js` documenta el ataque `<img onerror>`). Resultado: XSS en el origen de la app → lectura de `localStorage` (clave Gemini ofuscada, config Firebase), persistencia en documentos exportados (PDF/DOCX que llevan el resumen incrustado) → ataque a terceros que abran la propuesta.

**Solución (código propuesto, financials.js:619):**

```js
var generatedText = await requestCommercialSummaryFromGemini(d, m, equipment);
if (generatedText && generatedText.trim()) {
  container.innerHTML = (window.RASanitize && window.RASanitize.richText)
    ? window.RASanitize.richText(generatedText)
    : window.RASanitize.plain(generatedText);
  if (badge) badge.innerHTML = '✨ Resumen generado con IA · Google Gemini';
}
```

**Y como seguro estructural** (ver ARC-02): test de contrato en CI que busque `innerHTML =` con variables sin envoltorio `RASanitize`.

---

### 🟡 SEC-05 — Importación `.raproject` sin validación de esquema ni bloqueo `__proto__` (MEDIO)

**Descripción.** `importProjectData()` valida mínimamente el formato (`format === 'RA_SOLAR_PROJECT'` o presencia de `polylines/planes`) y avisa si la versión es mayor, pero confía en todo el contenido:

```js
Object.assign(panelConfig, projectData.panelConfig);              // :988
Object.assign(window.solarProjectConfig, elec.selections);        // :1074
Object.assign(window.solarProjectConfig, projectData.projectConfig); // :1146
```

`Object.assign` con una fuente que contiene la clave `"__proto__"` (JSON.parse la materializa como propiedad propia) **re-asigna el prototipo** del objeto destino: confusión de tipos, gadgets, y de ahí a ejecución (el config alimenta los ~240 `innerHTML` del cliente).

**Ubicación:** `js/project-storage.js:986–990, 1074, 1146` + entrada `FileReader` en `:1479–1497` y drag&drop en `:1993–2013`.

**Riesgo.** *Escenario de ataque realista*: una víctima descarga/abre un `.raproject` malicioso (compartir proyectos es habitual: "mira mi diseño") → su configuración global queda envenenada → de ahí a XSS persistente en su navegador, con acceso a la clave Gemini y a sus proyectos cloud.

**Solución (código propuesto, en project-storage.js — merge seguro + validación de esquema):**

```js
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function safeAssign(target, source) {
  if (!source || typeof source !== 'object') return target;
  Object.keys(source).forEach(function (k) {
    if (FORBIDDEN_KEYS.has(k)) return;      // anula la pollution clásica vía "__proto__"
    var v = source[k];
    if (typeof v === 'function') return;    // nada de código ejecutable dentro de un JSON
    if (v === null || typeof v !== 'object') { target[k] = v; return; }
    // Objetos con prototipo raro o anidación profunda: clon plano y limpio (JSON nativo).
    // Para profundidad arbitraria, sustituir este clon por una recursión que
    // también filtre FORBIDDEN_KEYS en los niveles internos.
    target[k] = JSON.parse(JSON.stringify(v));
  });
  return target;
}

// Sustituir los tres Object.assign por safeAssign:
safeAssign(window.solarProjectConfig, projectData.projectConfig);
```

**Plus recomendado:** una función `validateProjectSchema(projectData)` con lista blanca por sección (polylines, buildings, obstacles, panelConfig, electrical, financials) que rechace (o recorte) propiedades desconocidas y que compruebe rangos numéricos. El HUD de carga ya tiene el punto de enganche perfecto (`Fase 1: Migración y verificación de esquema`).

---

### 🟡 SEC-06 — Clave de Maps contra Web Services desde el navegador (MEDIO)

**Descripción.** `viewer.js` llama Geocoding y Elevation (APIs de *Web Service*) directamente desde el cliente con `?key=`:

```js
// viewer.js:431
https://maps.googleapis.com/maps/api/geocode/json?address=...&key=${apiKey}
// viewer.js:694
https://maps.googleapis.com/maps/api/elevation/json?locations=${lat},${lon}&key=${apiKey}
```

**Ubicación:** `js/viewer.js:425–445` (`geocodeAddress`) y `:685–706` (`getGroundElevation`).

**Riesgo.**
- Las WS APIs **no admiten restricción por HTTP referrer** (solo por IP): por construcción, una clave de WS embebida en navegador solo puede limitarse por cuota (la restricción por IP no aplica a cliente).
- La clave viaja en query string (logs de proxy, historial).
- Los endpoint WS no envían cabeceras CORS → el fetch probablemente **falle silenciosamente** y caiga al fallback de Open-Meteo (código ya previsto), es decir: cuota quemada sin beneficio, o penalización de latencia (timeout 2 s) en búsqueda geográfica por llamada.

**Solución recomendada.**
1. **Camino JS puro:** usar los servicios del Maps JavaScript API (restringibles por referrer): `new google.maps.Geocoder()` y `new google.maps.ElevationService()`.
2. Si se quiere mantener la WS (por control del parsing): pasar por una **Cloud Function proxy** (patrón `gwaProxy` ya existente: allowlist, rate-limit, timeout) con la clave de WS en `functions/.env` (server-side, restringible por IP del server).
3. Ni una sola clave en la cadena sin restricción + cuota diaria máxima.

---

### 🟡 SEC-07 — Sin App Check (MEDIO)

**Descripción.** Las reglas de Firestore/Storage protegen por `request.auth`, pero no hay nada que impida a un script headless autenticarse con una cuenta gratuita y hacer scraping sin navegador. El ejemplo (`ra-env.example.js`) ya lo recomienda y no está hecho.

**Ubicación:** `js/firebase-service.js` (init), consola Firebase (App Check), `functions/index.js`.

**Riesgo.** Enumeración masiva de proyectos si un atacante obtiene credenciales de prueba, abuso de Firestore (facturación de lecturas): reglas correctas pero cliente no humanizado.

**Solución recomendada.** Activar App Check (reCAPTCHA v3) para la app web en consola, activar el SDK en `firebase-service.js` (compat: `firebase.appCheck().activate(...)`), iniciar en modo *monitor* y pasar a *enforcement* tras medir. De arranque, la protección por servicio (consola) es suficiente; las reglas no se tocan.

---

### 🟡 PERF-01 — Monolito de 1 MB (MEDIO)

**Descripción.** Métricas reales del 29/10/2026:

| Métrica | Valor |
|---|---|
| `index.html` | **958 KB, 15.260 líneas** |
| `<script>` tags | **77** |
| Asignaciones `innerHTML` (js+html) | **≈240** |
| Módulos `js/*.js` (+13 en `js/wind/`) | **63** |

**Riesgo.**
- Parseo inicial pesado (TTI elevado sobre todo en móvil).
- `Cache-Control: no-cache, no-store` en el HTML es correcto por contenido dinámico, peor sin Service Worker ni versionado de assets → cada visita re-descarga ~1 MB.
- El coste de mantenimiento es la parte incómoda: la "regla de oro" del proyecto (el bloque inline congelado) contiene funcionalidad viva.

**Solución recomendada (roadmap, no big-bang).**
1. Corto plazo: crear **Service Worker** simple (cache-first para `js/*.js`, `css/`, assets; network-first para `index.html`) → segunda visita instantánea sin tocar el monolito.
2. Medio plazo: extraer el bloque inline vivo a módulos `js/` con nombre y versión (la infraestructura ya existe: `lazy-loader.js`; `AGENTS.md` regla 6 lo exige para código nuevo). Medir con `js/ra-benchmark.js`.
3. Versionado (`app.js?v=hash`) + `Cache-Control: public, max-age=31536000, immutable` para js/css versionados, liberando al HTML del `no-store`.

---

### 🟡 ARC-01 — Parser GWA duplicado con desalineación de hardening (MEDIO)

**Descripción.** `parseWAsPLib()` y `fetchTextLimited()` existen **por partida doble**: `server.js:24–140` y `functions/index.js:10–143`. La copia de la Cloud Function lleva los topes `[AUD-2026 · B-09]` (rango de cabeceras `numRough≤8, numHeights≤12, numSectors≤36`); la copia de `server.js` **no los tiene**.

**Ubicación:** `server.js:39–105` vs `functions/index.js:25–103`.

**Riesgo.** Un `.lib` trucha servido por el XML proxy puede provocar un bucle masivo en la copia local (CPU DoS del dev-server). Además, cualquier corrección futura del parser se hará en un sitio y no en el otro — la divergencia clásica que produce el bug raro.

**Solución recomendada.**
- **Inmediato:** portar los topes de `functions/index.js:39–44` a `server.js` (5 líneas).
- **Estructural:** extraer a `lib/gwa-wasp-parser.js` consumido por `server.js` (require) y dejar en `functions/index.js` una copia espejo + **test de paridad** (`tests/test-gwa-parity.js`) que ejecute ambos parsers con el mismo fixture y compare salidas. (Cloud Functions solo empaqueta su directorio; la duplicación física es inevitable, pero la paridad sí debe garantizarse.)

---

### 🟡 SEC-08 — `/api/gwa` local sin rate-limit (MEDIO)

**Descripción.** La versión de Cloud Function tiene rate-limit (30/min/IP); la de `server.js` no.

**Ubicación:** `server.js:253–263`.

**Riesgo.** Con `--lan`, un bucle en el equipo de al lado puede saturar el socket y la cuota de DTU GWA. Es dev-server, así que MEDIO.

**Solución (código propuesto, server.js):**

```js
const gwaHits = new Map(); // ip → {start, count}
function gwaRateLimited(ip) {
  const now = Date.now();
  const e = gwaHits.get(ip);
  if (!e || now - e.start > 60000) { gwaHits.set(ip, { start: now, count: 1 }); return false; }
  e.count += 1;
  return e.count > 30;
}
// Dentro de la rama /api/gwa:
const ip = (req.socket.remoteAddress || 'unknown');
if (gwaRateLimited(ip)) { sendJson(res, 429, { error: 'Demasiadas peticiones' }); return; }
```

---

### 🟡 ARC-02 — `innerHTML` como patrón (MEDIO)

**Descripción.** Aprox. **240 asignaciones `innerHTML`** en módulos JS + monolito. El sanitizador existe, pero cada nueva pantalla decide si lo usa → la garantía depende de la disciplina humana, no del sistema.

**Riesgo.** Una sola inyección al estilo SEC-04 derriba el resto. Los datos de origen de estos renders incluyen: contenido IA, importaciones `.raproject`, catálogos heredados y campos de usuario.

**Solución recomendada.**
1. Regla de proyecto: *todo HTML dinámico pasa por `RASanitize.richText()` (riqueza) o `plain()` (texto)* → documentarla en `doc/04-convenciones.md`.
2. Lint de contrato (script node, 20 líneas) que falle el build si aparece `innerHTML\s*=` con una variable y no en la misma línea `RASanitize` — arranque gradual documentado con excepciones inline (`// ASAN-OK: contenido estático interno`).
3. Evolución: migrar los renders matriciales (bom-tree, electrical-engine, equipment-*) a construcción DOM (`createElement` + `textContent`) donde el coste es bajo.

---

### 🟢 Bajos (QUA-01, QUA-02, QUA-03, SEC-09, PERM-01)

| ID | Detalle | Solución |
|:---|:--------|:---------|
| QUA-01 | Doble `'use strict'` en `js/config.js:3–4` | Eliminar la duplicada (cosmético) y activar ESLint (`eslint --no-inline-config`) en CI |
| QUA-02 | Sin tipado: `var` legacy (`financials.js`), sin JSDoc | Progresivo: JSDoc en módulos nuevos + `tsconfig.json --checkJs allowJs`, soporte módulo a módulo |
| QUA-03 | 21 codemods (`patch_*`, `fix_*`) en la carpeta padre `C:\TRABAJOS\RA\` | Mover a `RA/scripts/codemods/` con README que diga cuáles ya se aplicaron (evitar re-parcheo) |
| SEC-09 | `equipment_catalog` lectura pública; `users/{uid}` auto-escritura sin field validation | Documentar que es público por diseño; añadir `"allow write: if isSignedIn() && request.auth.uid == userId && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['role','admin'])"` (blindaje por si a futuro se usan campos sensibles en /users) |
| PERM-01 | `/branding` lectura solo con `isSignedIn()` (cualquier autenticado lee branding de cualquiera) | Afinar a propietario si el branding contiene datos sensibles; hoy es solo logo/tema → BAJO |

---

## 3. PLAN DE ACCIÓN PASO A PASO

### 🚨 FASE 0 — HOY MISMO (≤ 45 min, orden estricto)

1. **Generar claves nuevas restringidas:**
   * Google Cloud Console → APIs y servicios → Credenciales → nueva clave Maps con: restricción de **API** (solo Map Tiles API + Maps JavaScript API — las que usa el visor), **referrer** `https://ra-solar-3d.web.app/*` y `https://ra-solar-3d.firebaseapp.com/*`, y **cuota diaria máxima**.
   * Cesium ion → my-tokens → **crear token nuevo** (con dominio si el plan lo permite) y **NO revocar** aún el viejo.
   * Firebase web apiKey: restringir por referrer en la misma consola GCP; planificar App Check (Fase 1).
2. **Actualizar `js/ra-env.js` local** con los valores nuevos.
3. **Editar `firebase.json` (hosting.ignore):** AÚN NO. En Fase 0 el archivo debe seguir desplegándose (la app en producción lo carga); el cambio definitivo llega en Fase 2 con la inyección en build.
4. **Desplegar:** `firebase deploy --only hosting`.
5. **Verificar:** `curl https://ra-solar-3d.web.app/js/ra-env.js` → debe mostrar las claves **nuevas**.
6. **Revocar las claves antiguas** (Maps: borrar la clave vieja en GCP; ion: revocar el token `aa603f3d-…`).
7. **Micro-parches de código** (con `adelante`): `DENIED_FILES` + `test-server-hardening.js` (SEC-03), fix `financials.js:619` (SEC-04), topes del parser en `server.js` (ARC-01), rate-limit local (SEC-08). Cuatro cambios quirúrgicos, todos con test.
8. Correr `node tests/run-all.js` y comprobar CI verde.

### 🧱 FASE 1 — ESTA SEMANA

9. **Limpieza de historial Git (SEC-02):** tras rotar (paso 6), el daño histórico ya es inocuo; limpiar por higiene:
   ```bash
   # crear fichero de sustituciones replacements.txt con las claves viejas → REMOVED
   bfg --replace-text replacements.txt
   git reflog expire --expire=now --all && git gc --prune=now --aggressive
   git push --force  # coordinar: se reescribe la historia del repo
   ```
10. **GitHub Push Protection + Secret Scanning** si el repo vive en GitHub.
11. **App Check (SEC-07):** reCAPTCHA v3 + activación en modo monitor + observación 7 días → enforcement.
12. **Firestore `users` (SEC-09):** blindar escritura de campos sensibles (rule sugerida arriba); añadir test de reglas si se integra el emulador.
13. **Hardening de Storage en runtime (PERM-01 opcional).**

### 🏗️ FASE 2 — CONSOLIDACIÓN (2–3 semanas, con permiso)

14. **Inyección de credenciales en build (SEC-01 definitiva):** CI/CD que sustituya un `ra-env.js` placeholder desde secretos al desplegar; añadir `js/ra-env.js` al ignore de hosting permanentemente → producción sirve placeholder + app funciona (las claves van en el bundle generado).
15. **Proxear Geocoding/Elevation (SEC-06):** Cloud Function `gsaProxy` (patrón gwaProxy) o client-side Maps JS SDK (restringible por referrer).
16. **Importación blindada (SEC-05):** `safeAssign` + `validateProjectSchema` + fixture de `.raproject` malicioso en `tests/` (`test-project-import-fuzz.js`: `__proto__`, claves-función, NaN, profundidades grotescas).
17. **Lint de saneado (ARC-02):** script contrato `test-sanitize-contract.js` en CI; ir cerrando los falsos positivos con `ASAN-OK` justificados.
18. **Service Worker + versionado de assets (PERF-01 fase corta).**

### 🚀 FASE 3 — EVOLUCIÓN (mes siguiente)

19. Extracción progresiva del bloque inline del monolito a módulos `js/` (regla 6 de AGENTS.md); objetivo: que el `<script>` inline solo arranque la app.
20. Parser GWA en `lib/` + test de paridad en ambos pipelines (ARC-01 estructural).
21. ESLint (con `no-unsanitized`), branch strategy y pre-commit hooks (`lint-staged`).
22. Observabilidad (opcional): export del buffer de `error-handler.js` a Crashlytics/Sentry para producción real.

### ✅ CRITERIOS DE VERIFICACIÓN (definición de "hecho")

```bash
# SEC-01/02: prod sin claves viejas
curl -s https://ra-solar-3d.web.app/js/ra-env.js | grep -c "AIzaSyAj-cG-tvA"   # → 0 (clave Maps vieja fuera)
curl -s https://ra-solar-3d.web.app/js/ra-env.js | grep -c "AIzaSyA96UjIJ"     # → 0 (apiKey Firebase vieja fuera)
curl -s https://ra-solar-3d.web.app/js/ra-env.js | grep -c "PEGA_AQUI"         # → 0 (tras Fase 0 el fichero lleva claves nuevas restringidas, no la plantilla)
curl -s https://ra-solar-3d.web.app/js/ra-env.js | grep -c "AIzaSy"            # ≥ 1: en cliente la clave siempre viaja; lo que importa es que sea la NUEVA y restricta
# SEC-03: servidor local
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/js/ra-env.js      # → 404
# SEC-04/05: tests
node tests/run-all.js --only=test-security-contract --bail                     # verde con los nuevos casos
grep -c "RASanitize" js/financials.js                                          # ≥ 5 usos (los 4 existentes + 619)
# SEC-02: git
git log -S "AIzaSyAj-cG-tvA" --all | wc -l                                     # → 0 tras BFG
```

---

## ANEXO A — CRÉDITO: LO QUE YA ESTÁ SANO (ola AUD-2026 previa)

| Control | Estado | Evidencia |
|:--------|:-------|:----------|
| Servidor estático allowlist + headers + 400 no fatal | ✅ | `server.js:175–231`, `tests/test-server-hardening.js` |
| SSRF mitigado en proxy GWA (allowlist host, tope bytes, timeout) | ✅ | `functions/index.js:130–143` |
| CPU DoS por cabeceras `.lib` (topes) | ✅ (solo en la CF) | `functions/index.js:39–44` |
| Firestore/Storage con owner/tenant/claims y validación de uploads | ✅ | `firestore.rules`, `storage.rules` |
| Sanitizador por allowlist para HTML de IA | ✅ pero opt-in | `js/sanitizer.js` |
| Clave Gemini por header (no URL) + timeout + cancelación | ✅ | `js/company-branding.js:92–115` |
| Error Boundary con buffer forense | ✅ | `js/error-handler.js` |
| CI con batería + guardas de secretos | ✅ | `.github/workflows/tests.yml` |
| CORS dominio/restricciones en proxies | ✅ | `functions/index.js:111–116`, `server.js:236–243` |

## ANEXO B — MATRIZ OWASP TOP 10 (2021)

| Riesgo | ¿Es visible? | Hallazgos |
|:-------|:-------------|:----------|
| A01 Broken Access Control | Parcial | SEC-01, SEC-03, PERM-01 |
| A02 Cryptographic Failures | No (no hay crypto custom; la ofuscación de la clave es apenas cosmética y está documentada) | — |
| A03 Injection (XSS/prompt) | Sí | SEC-04, SEC-05, ARC-02 |
| A04 Insecure Design | Parcial | SEC-06 (WS key en cliente), SEC-05 |
| A05 Security Misconfiguration | Sí | SEC-01 (hosting ignore), SEC-07 (App Check), QUA-01 |
| A06 Vulnerable Components | Bajo (deps mínimas; Firebase compat 10.9.0 conviene鹰 actualizar) | — |
| A07 Auth Failures | Bajo (Firebase Auth estándar; no hay flujos custom) | — |
| A08 Data Integrity Failures | Sí | SEC-05 (.raproject import) |
| A09 Logging/Monitoring | Bajo (buffer local sin export) | Fase 3 |
| A10 SSRF | Mitigado | (verificado en ola previa B-10) |

## ANEXO C — NOTA SOBRE ESTE DOCUMENTO

- Ningún código del proyecto ha sido modificado como resultado de la auditoría (regla 3 de AGENTS.md: diagnóstico primero, aprobación antes de tocar). El Plan de Acción está diseñado para paso a paso con confirmación.
- Los hashes de commits referenciales son del checkout del 29/10/2026.
