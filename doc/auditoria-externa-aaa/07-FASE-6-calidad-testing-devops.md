# FASE 6 — Calidad, Testing Automatizado (E2E + Emulator) y DevOps CI/CD

> **Objetivo de la fase:** Sustituir las baterías de pruebas basadas en mocks desfasados/regex por contratos reales + Playwright E2E + Firebase Emulator, automatizar despliegues con canales Preview por PR, inyección automática de fecha/versión/commit (eliminando ediciones manuales en HTML) y endurecimiento de proxy backend.
> **Prerrequisitos recomendados:** Idealmente ejecutar junto o tras las correcciones críticas de seguridad/persistencia de [01-FASE-0-estabilizacion-bugs-criticos.md](./01-FASE-0-estabilizacion-bugs-criticos.md).
> **Protocolo para IAs:** Consulta [00-INDICE.md](./00-INDICE.md) y registra avances en [99-REGISTRO-AVANCES.md](./99-REGISTRO-AVANCES.md). **Nota:** por restricción de proyecto, las IAs ejecutoras deben validar puntualmente la prueba específica de su ticket o bajo petición del usuario.

---

## Métricas Baseline Verificadas

- **Suites actuales (`tests/`):** **63** archivos de test de consola; **39 (61,9%)** evalúan fragmentos en sandbox sobre mocks manuales (algunos ya desfasados frente a las claves reales retornadas por el motor).
- **Cobertura ciega:** **34 de 82 módulos JS (41,5%)** carecen de cualquier referencia en los tests (incluidos autoguardado principal, IndexedDB `storage-cache.js`, `bill-auditor.js`, `ui-outliner.js`, `proposal-style-studio.js`, `wind-ui.js`).
- **E2E y Emuladores:** **0** tests en navegador real (pese a existir Puppeteer sin declarar en `package.json`) y **0** tests contra emulador de Firestore/Storage.
- **DevOps / Deploy:** `.github/workflows/tests.yml` solo ejecuta tests de consola en Node; no hay build reproducible, preview deploy, SAST ni audit; la fecha y hash de deploy están hardcodeados manualmente en `index.html:2757, 4016` y **74** cache-busters `?v=`.

---

## Tabla de Tareas — Fase 6

| ID | Título | Severidad | Esfuerzo | Dependencias | Origen | Estado |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| **F6-01** | Eliminar deriva de seguridad y compartición SSRF/CORS entre `functions/index.js` y `server.js` | P1 | M | F0-09 | F-04 | `[Hecho]` |
| **F6-02** | Endurecer `firestore.rules`, `storage.rules`, crear índice compuesto y proteger origen en `firebase-service.js` | P1 | M | F0-09 | F-05 | `[Hecho]` |
| **F6-03** | Saneamiento de exportación DOCX/MHTML contra XSS DOM y fugas URL en Word | P2 | S | F0-08 | F-06 | `[Hecho]` |
| **F6-04** | Actualizar tests con mocks obsoletos, declarar Playwright + Firebase Emulator y cubrir módulos ciegos (41,5%) | P1 | L | F6-05 | F-15 | `[Pendiente]` |
| **F6-05** | Automatizar pipeline CI/CD: build `dist/`, auto-inyección de fecha/commit/versión, SAST y Firebase Preview por PR | P1 | M | F0-09 (o F4-01 si ya existe Vite) | F-16 | `[Pendiente]` |

---

## Detalle Técnico por Tarea

### `F6-01` — Eliminar deriva de seguridad y compartición SSRF/CORS entre `functions/index.js` y `server.js`

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Seguridad / Backend |
| **Severidad** | P1 (Alto) |
| **Esfuerzo** | M (2–8 horas) |
| **Dependencias** | F0-09 |
| **Origen** | F-04 |
| **Rama sugerida** | `sec/unify-proxy-ssrf-cors` |
| **Estado** | `[Hecho]` |

#### Contexto y Problema
El proxy de producción en Cloud Functions (`functions/index.js`) quedó desfasado respecto a los endurecimientos aplicados en desarrollo local (`server.js`):
- Acepta orígenes CORS de cualquier proyecto tercero alojado en Firebase Hosting.
- Valida hosts por simple terminación de cadena sin exigir punto separador ni protocolo HTTPS estricto (permitiendo bypass SSRF con dominios homónimos).
- Sigue redirecciones HTTP sin validar el host destino final.
- Carece de comprobación de longitudes/numéricos en el analizador eólico provocando errores 502 si falta cota.
- Implementa rate-limit en mapa en memoria sin cota máxima ni poda y confía en cabeceras reenviadas falsificables.

#### Evidencia Verificada
- `functions/index.js:51-65, 112-185`
- `server.js:75-89, 135-180, 265-271`

#### Pasos de Implementación
1. Extraer un módulo compartido (o sincronizado en script pre-deploy hacia `functions/`) con el validador estricto de URLs (`validateExternalProxyUrl`), lista cerrada de orígenes CORS permitidos y parser eólico defensivo.
2. En `functions/index.js`, exigir protocolo `https:`, coincidencia exacta de host o subdominio precedido por `.`, `redirect: 'manual'` / bloqueo de redirecciones externas, lista CORS cerrada únicamente a los dominios propios (`ra-solar-3d.web.app`, `ra-solar-3d.firebaseapp.com`, `localhost`), poda LRU/TTL en el rate-limiter (complementado con Cloud Functions `maxInstances` / App Check).
3. Validar numéricos obligatorios en el parser eólico antes de operar, retornando `422/400` controlado en lugar de `502`.

#### Criterios de Aceptación
- Tests unitarios sobre el validador compartido rechazan `https://evil-globalwindatlas.info`, `http://globalwindatlas.info`, redirecciones `302` a `169.254.169.254` y cabeceras `Origin: https://otro-proyecto.web.app`.
- Tanto `server.js` como `functions/index.js` ejecutan exactamente la misma política.

---

### `F6-02` — Endurecer `firestore.rules`, `storage.rules`, crear índice compuesto y proteger origen en `firebase-service.js`

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Seguridad / Infraestructura Cloud |
| **Severidad** | P1 (Alto) |
| **Esfuerzo** | M (2–8 horas) |
| **Dependencias** | F0-09 |
| **Origen** | F-05 |
| **Rama sugerida** | `sec/firebase-rules-indexes-isolation` |
| **Estado** | `[Hecho]` |

#### Contexto y Problema
1. `firestore.rules` permite crear proyectos sin validar pertenencia del `tenantId` ni tamaño/esquema del documento, habilitando inyección entre organizaciones o colisión de IDs predecibles.
2. `firestore.indexes.json` está completamente vacío (`[]`), garantizando error en producción al ejecutar la consulta de listado filtrando por propietario y ordenando por actualización anidada.
3. `storage.rules` permite a cualquier usuario autenticado leer logotipos y branding de otras empresas; además `firebase-service.js` concatena el nombre de archivo sin sanear rutas ni impedir caídas a ruta anónima, y permite sobrescribir la config Firebase desde `localStorage`.

#### Evidencia Verificada
- `firestore.rules:11-39`
- `storage.rules:12-38`
- `firestore.indexes.json:1-4`
- `js/firebase-service.js:37-52, 165-253, 336-354`

#### Pasos de Implementación
1. Definir en `firestore.indexes.json` el índice compuesto necesario para la query real de `firebase-service.js` (`ownerUid` / `tenantId` + `updatedAt` desc).
2. En `firestore.rules`, exigir `request.auth != null`, coincidencia `request.resource.data.tenantId == request.auth.token.tenantId` (o `ownerUid == request.auth.uid` cuando aplique modo personal), `request.resource.size` / validación de campos clave y prohibir sobreescritura de `create` sobre documentos existentes.
3. En `storage.rules`, restringir lectura de recursos de marca/empresa al propio usuario o mismo `tenantId` autenticado (en vez de `request.auth != null` abierto), validar `contentType` de imagen y límite de tamaño (`<= 2 MB` logos / `<= 5 MB` fotos).
4. En `firebase-service.js`: exigir usuario autenticado antes de construir path de Storage, sanear `filename` contra `..` y caracteres inválidos usando UUID + extensión validada, y deshabilitar override dinámico de configuración Firebase desde `localStorage` en producción.

#### Criterios de Aceptación
- Suite automatizada ejecutada contra `firebase emulators:exec` confirma: rechazo `PERMISSION_DENIED` al leer/escribir documentos o logotipos de otro tenant, éxito en subida y listado paginado/ordenado usando `firestore.indexes.json`, y bloqueo de override de config desde `localStorage`.

---

### `F6-03` — Saneamiento de exportación DOCX/MHTML contra XSS DOM y fugas URL en Word

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Seguridad |
| **Severidad** | P2 (Medio) |
| **Esfuerzo** | S (<2 horas) |
| **Dependencias** | F0-08 |
| **Origen** | F-06 |
| **Rama sugerida** | `sec/docx-mhtml-url-sanitization` |
| **Estado** | `[Hecho]` |

#### Contexto y Problema
`docx-exporter.js` construye un nodo DOM directamente con el HTML entrante antes de depurar nodos, resuelve imágenes/CSS remotos realizando peticiones desde sesión de usuario e incrusta en el paquete MHTML el título sin escapar y posibles URLs externas residuales que Microsoft Word resuelve automáticamente al abrir el `.doc`/`.docx`, filtrando IP/tokens NTLM en redes corporativas.

#### Evidencia Verificada
- `js/docx-exporter.js:166-184, 272-399`
- `js/financials.js:6739-6753`, `js/commercial-proposal-dossier.js:2350-2450`

#### Pasos de Implementación
1. Pasar todo HTML entrante a `docx-exporter.js` por la lista blanca estricta de `sanitizer.js` **antes** de asignarlo al contenedor temporal del DOM (`tempDiv.innerHTML`).
2. Bloquear resolución de `fetch` sobre URLs remotas arbitrarias (admitir únicamente `data:image/`, `blob:` y assets locales autorizados) y eliminar atributos/reglas CSS `url(http...)` residuales antes de empaquetar el MHTML.
3. Escapar XML/HTML el título y metadatos de cabecera del documento Word.

#### Criterios de Aceptación
- El contenido empaquetado resultante del exportador Word no contiene ninguna URL externa `http://` ni `https://` ejecutable ni XML sin escapar cuando el título incluye `<>&"`.

---

### `F6-04` — Actualizar tests con mocks obsoletos, declarar Playwright + Firebase Emulator y cubrir módulos ciegos (41,5%)

| Campo | Valor |
| :--- | :--- |
| **Categoría** | QA/Testing |
| **Severidad** | P1 (Alto) |
| **Esfuerzo** | L (1–3 días) |
| **Dependencias** | F6-05 (pipeline donde correrán E2E y emulador) |
| **Origen** | F-15 |
| **Rama sugerida** | `qa/real-contracts-playwright-emulator` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
El **61,9%** (`39/63`) de los tests actuales evalúan fragmentos en sandbox con mocks manuales que ya ni coinciden con las firmas reales del motor financiero/eléctrico, generando falsos positivos. El **41,5%** (`34/82` módulos, incluidos autoguardado principal, `storage-cache.js`, `bill-auditor.js`, `ui-outliner.js`, `proposal-style-studio.js`, `wind-ui.js`) no tienen test alguno, y no existe ningún test E2E en navegador real ni contra emuladores de Firebase pese a existir binarios locales de Puppeteer sin declarar en `package.json`.

#### Evidencia Verificada
- `tests/run-all.js:1-100`
- `tests/test-proposal-toolbar.js:37-51`
- `tests/test-ra-full-workflow.js:13-77`
- `tests/test-security-contract.js:5, 23-53`
- `package.json:1-13`

#### Pasos de Implementación
1. Declarar `playwright` (o `puppeteer`) y `firebase-tools` como `devDependencies` explícitas en `package.json` junto a scripts `test:e2e` y `test:rules`.
2. Auditar y reparar los tests con mocks divergentes para que importen los contratos/funciones reales del módulo correspondiente (eliminando comprobaciones cosméticas basadas en regex de código fuente).
3. Escribir tests de contrato/integración para los huecos críticos: persistencia IndexedDB + cuota excedida, migración de esquema `v1.x–2.4`, sanitización XSS en DOM real (jsdom o Playwright), `bill-auditor`, `wind-electrical` y consistencia numérica multi-documento.
4. Añadir suite E2E mínima con Chromium headless (WebGL SwiftShader): arrancar app, comprobar 0 errores de consola, crear/importar proyecto `.raproject` con payload XSS neutralizado, editar cubierta/string MPPT, probar guardado/recarga y generar propuesta.
5. Añadir suite de reglas `firestore.rules` y `storage.rules` contra Firebase Emulator.

#### Criterios de Aceptación
- Cobertura de módulos testeados sube de `58,5%` a **>= 85%**.
- Suite Playwright E2E + Firebase Emulator ejecuta en CI verde sin depender de dependencias globales ocultas.

---

### `F6-05` — Automatizar pipeline CI/CD: build `dist/`, auto-inyección de fecha/commit/versión, SAST y Firebase Preview por PR

| Campo | Valor |
| :--- | :--- |
| **Categoría** | DevOps/CI-CD |
| **Severidad** | P1 (Alto) |
| **Esfuerzo** | M (2–8 horas) |
| **Dependencias** | F0-09 (manejo seguro de entorno/secretos sin subir `ra-env.js`), ideal coordinado con F4-01 |
| **Origen** | F-16 |
| **Rama sugerida** | `ci/auto-deploy-stamp-preview-sast` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
`.github/workflows/tests.yml` solo ejecuta tests de consola en Node: no construye artefacto `dist/`, no valida seguridad/dependencias, no corre emulador/E2E ni despliega. Peor aún, las etiquetas de última fecha de deploy (`DEPLOY: 2026-11-24 08:41 (v3.2.0 · #39ac279)` en `index.html:2757, 4016`) y los **74** cache-busters `?v=` son editados a mano, garantizando desfases entre lo mostrado en la UI y lo realmente desplegado en producción.

#### Evidencia Verificada
- `.github/workflows/tests.yml:1-31`
- `index.html:9-100, 2757, 4016`
- `package.json:1-13`

#### Pasos de Implementación
1. Crear script de build / plugin (`scripts/inject-build-meta.mjs` o `define` de Vite tras F4-01) que lea `package.json` (`version`), `git rev-parse --short HEAD` (`GITHUB_SHA`) y `new Date().toISOString()` en el momento exacto del build/deploy para generar `build-meta.json` e inyectar automáticamente fecha/hora, versión y commit SHA en las insignias del modal de configuración y popover de ajustes (sustituyendo los strings estáticos en `index.html:2757, 4016`).
2. Generar `dist/js/ra-env.js` en tiempo de pipeline desde GitHub Secrets restringidos por dominio, garantizando que nunca exista archivo secreto sin filtrar en git ni subido desde máquina local.
3. Ampliar `.github/workflows/tests.yml` con jobs:
   - `lint-type-security`: sintaxis / ESLint + audit + CodeQL / Semgrep para sinks XSS y `catch` vacíos.
   - `unit-and-rules`: tests reales + Firebase Emulator.
   - `e2e-playwright`: build `dist/` + smoke E2E WebGL.
   - `deploy-preview` (en Pull Requests): `FirebaseExtended/action-hosting-deploy` creando canal efímero de previsualización por PR.
   - `deploy-prod` (solo push a `main` tras todos los checks verdes): despliegue oficial a `ra-solar-3d` (Hosting + `functions` + `firestore:rules,indexes` + `storage:rules`) con etiqueta de versión automática.

#### Criterios de Aceptación
- **0** ediciones manuales en `index.html` para actualizar fecha de deploy, hash o `?v=`.
- Cada PR publica automáticamente su URL preview tras pasar lint/tests/emulador/E2E.
- Al desplegar `main`, la cabecera del modal de configuración muestra el SHA, versión y timestamp exactos del deploy productivo recién lanzado.
