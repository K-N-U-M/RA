# FASE 6 (Auditoría Externa v2) — Seguridad AppSec, Reglas Cloud, Persistencia y DevOps

> **Objetivo:** Endurecer CSP real, cerrar el puente BFF + App Check, corregir reglas `delete`/tenant en nube, evitar pérdida de datos >1,2 MB o multi-pestaña y blindar reproducibilidad CI.  
> **Protocolo para IAs:** Ver [00-INDICE.md](./00-INDICE.md) y registrar cierre en [99-REGISTRO-AVANCES.md](./99-REGISTRO-AVANCES.md).

---

## Tabla de Tickets — Fase 6

| ID | Título | Sev. | Esf. | Dependencias | Estado |
| :--- | :--- | :---: | :---: | :--- | :---: |
| **V2-F6-01** | Endurecer CSP sin `'unsafe-inline'`/`'unsafe-eval'` ni proxies CORS públicos y activar Trusted Types | P0 | XL | V2-F4-01, V2-F4-03 | `[Pendiente]` |
| **V2-F6-02** | Cablear `AI_BFF_URL`, App Check cliente/servidor, cuotas distribuidas y paridad `/api/ai` en `server.js` | P1 | M | V2-F3-01 | `[Pendiente]` |
| **V2-F6-03** | Separar `delete` en `storage.rules`/`firestore.rules`, corregir `tenantId`/miembros y blindar DOCX SVG/UNC | P1 | M | — | `[Pendiente]` |
| **V2-F6-04** | Corregir banner `__idbAutosave`, guarda `< 1 MiB` + Storage offload y bloqueos multi-pestaña | P1 | L | — | `[Pendiente]` |
| **V2-F6-05** | Añadir `package-lock.json`/`npm ci`, ESLint/Stylelint/`knip`/`npm audit`, `typecheck` CI y E2E/Rules ampliados | P2 | L | V2-F0-02, V2-F0-03 | `[Pendiente]` |

---

### `V2-F6-01` — CSP Estricta y Trusted Types Obligatorio
- **Estado:** `[Pendiente]`
- **Evidencia:** `firebase.json:58` y `server.js:127` permiten `'unsafe-inline'`, `'unsafe-eval'` y proxies CORS públicos (`api.allorigins.win`, `api.codetabs.com`, `corsproxy.io`); persisten >250 `.innerHTML` y 5 `document.write()` (`commercial-proposal-dossier.js:2605`, `docs-generator.js:725,1903,2966`, `financials.js:6115`); `js/trusted-security-guard.js:23,98-115` define `ra-safe-policy` sin política `default`, sin `require-trusted-types-for 'script'` en CSP y sin llamadores de `sanitizeHtmlTrusted()`.
- **Plan:** Tras retirar handlers `on*` inline (Fase 4), eliminar `'unsafe-inline'`, `'unsafe-eval'` y proxies públicos (enrutando descargas vía Cloud Functions), y activar `require-trusted-types-for 'script'` con política canónica.
- **Criterios de aceptación:** CSP limpia sin `unsafe-inline/eval` ni proxies externos y Trusted Types bloqueando cualquier asignación DOM sin sanear.

### `V2-F6-02` — Cierre Real de Pasarela BFF (`/api/ai`) + Firebase App Check
- **Estado:** `[Pendiente]`
- **Evidencia:** `scripts/inject-build-meta.mjs:78-92` nunca escribe `AI_BFF_URL` en `window.RA_ENV`; `js/firebase-service.js:78-83` nunca carga `firebase-app-check-compat.js`; `js/ai-service.js:88-117` nunca adjunta `X-Firebase-AppCheck`; `functions/index.js:148-173` deja `ENFORCE_APP_CHECK = false` por defecto, usa `Map` por instancia sin LRU en `TENANT_QUOTA` y `server.js:121-198` carece de `/api/ai`, rate-limit y SPA rewrite.
- **Plan:** Inyectar `AI_BFF_URL` en build, inicializar Firebase App Check en `firebase-service.js`, adjuntar token `X-Firebase-AppCheck` en `ai-service.js`, activar cuota respaldada por Firestore/Redis o contador acotado LRU en `functions/index.js`, añadir `/api/ai` local en `server.js` y activar `ENFORCE_APP_CHECK=true` en producción.
- **Criterios de aceptación:** 0 peticiones directas del navegador a `generativelanguage.googleapis.com` y `aiProxy` validando Auth + App Check end-to-end.

### `V2-F6-03` — Reglas `delete` en Cloud Storage / Firestore, Tenant Members y Hardening DOCX
- **Estado:** `[Pendiente]`
- **Evidencia:**
  - `storage.rules:18-51` usa `allow write` con `request.resource != null`, bloqueando cualquier `delete` (`request.resource == null`); `firestore.rules:67` exige `request.resource.data.keys().size() <= 40` dentro de `allow write` (bloqueando también `delete` en `/users/{userId}` y sin lista blanca de campos).
  - `js/firebase-service.js:203,229` lee `user.tenantId` (null en Auth estándar en vez del custom claim `token.tenantId` de `firestore.rules:14`) y bloquea en cliente lecturas de `tenantMember`/`admin` (`data.ownerId !== _currentUser.uid`).
  - `js/docx-exporter.js:244-250,314,422-428,447-464` inyecta `options.styles` sin limpiar `</style>`, permite `file://`/`ms-msdt:`/`//host`/`\\host\share` (fuga SMB/NTLM en Word) y pasa `data:image/svg+xml` sin sanear si falla rasterización.
- **Plan:** Separar `allow create, update` de `allow delete` en ambas reglas, leer `getIdTokenResult().claims.tenantId` y respetar permisos de tenant/admin en `loadProjectFromCloud`, bloquear protocolos SMB/UNC/`file://`/`</style>` y raster/sanear SVG en `docx-exporter.js`.
- **Criterios de aceptación:** Usuarios y admins pueden borrar sus ficheros en Storage y perfiles en Firestore, miembros del mismo tenant cargan proyectos compartidos y el export DOCX bloquea rutas UNC/SMB y SVG maliciosos.

### `V2-F6-04` — Persistencia de Proyectos Grandes (`>1,2 MB`), `< 1 MiB` Firestore y Bloqueos Multi-Pestaña
- **Estado:** `[Pendiente]`
- **Evidencia:** `js/autosave-manager.js:61-77,193-214` descarga proyectos grandes a IndexedDB marcando `{ __idbAutosave: true }`, pero `wpCheckSavedProject()` (`:198`) ignora `__idbAutosave` y `workPlanes.planes`, dejando el banner de recuperación roto. `js/firebase-service.js:192,212` sube el JSON completo (con fotos/logos base64) a Firestore sin comprobar `1 MiB` ni derivar blobs a Storage. Y `project-storage.js` / `storage-cache.js` carecen de locks/canal `BroadcastChannel` provocando carreras multi-pestaña en `purgeOrphanedProjectsAsync` (`project-storage.js:2191`).
- **Plan:** Reconocer `__idbAutosave`/`workPlanes` en `wpCheckSavedProject()`; subir fotos/logos base64 a Firebase Storage guardando solo URLs/referencias en Firestore (`< 250 KB`); coordinar lecturas/purgas de recientes con `navigator.locks` + evento `storage`/`BroadcastChannel`.
- **Criterios de aceptación:** Proyectos de 5 MB restauran banner tras F5, sincronizan en nube `< 250 KB` vía Storage y no pierden entradas al usar 2 pestañas simultáneas.

### `V2-F6-05` — Determinismo de Build (`npm ci`), Tooling Estático Real y Cobertura E2E/Rules
- **Estado:** `[Pendiente]`
- **Evidencia:** Falta `package-lock.json` y CI usa `npm install --no-save` (`.github/workflows/tests.yml:14`); `npm run lint` solo comprueba sintaxis y `scripts/sast-check.mjs` solo 5 regex en `js/` (omitiendo `functions/` y `scripts/`); `typecheck` no corre en CI; `test-firebase-rules.js` (5 casos) omite `/users`, `/equipment_catalog`, Storage `/projects`/`/audits` y `delete`; `smoke.e2e.mjs` solo verifica arranque sin flujos reales.
- **Plan:** Generar `package-lock.json` con `npm ci`, incorporar ESLint, Stylelint, `knip`, `npm audit` y `npm run typecheck` en CI, ampliar `test-firebase-rules.js` (incluyendo deletes y Storage) y añadir flujos E2E reales (dibujo + paneles + factura + PDF) retirando gradualmente los 47 mocks VM heredados.
- **Criterios de aceptación:** CI determinista ejecutando lint/SAST/typecheck/rules/E2E con cobertura real sobre flujos críticos y reglas de seguridad.
