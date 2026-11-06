# 📋 Plan de Desarrollo: Backend Firebase para Catálogo Oficial y Recursos RA

> **Documento:** `doc/PLAN_BACKEND_FIREBASE_CATALOGO.md`  
> **Fecha de creación:** Octubre 2026  
> **Estado:** Planificado para ejecución futura  
> **Tecnologías:** Google Firebase v10+ (Authentication, Cloud Firestore, Cloud Storage), CesiumJS, Vanilla JS Modular

---

## 1. 🌐 Visión y Objetivos

Evolucionar la persistencia puramente local (`localStorage`) del Catálogo de Equipos de **RA (Visor Solar 3D)** hacia una **arquitectura híbrida en la nube (Offline-First)** respaldada por **Google Firebase**.

### Objetivos Clave:
1. **Multi-Dispositivo y Multi-Usuario:** Un instalador o ingeniería puede acceder a sus equipos personalizados, estructuras y precios desde cualquier equipo o sede.
2. **Catálogo Maestro Centralizado (Tier-1):** Mantenido y actualizado globalmente por los administradores de la plataforma sin requerir despliegues de frontend.
3. **Zero-Lag CAD:** No degradar en ningún milisegundo el renderizado 3D de CesiumJS ni el cálculo de sombras; lectura inmediata en local con sincronización asíncrona no bloqueante en segundo plano.
4. **Seguridad Multi-Tenant (OWASP & RGPD):** Aislamiento estricto de datos corporativos, tarifas y márgenes comerciales entre diferentes empresas.

---

## 2. 🗄️ Modelo de Datos en Cloud Firestore

### 2.1 Jerarquía de Colecciones

```
firestore/
│
├── global_equipment/                     <-- Catálogo Maestro Oficial (Lectura pública / Escritura admin)
│   ├── mod_aiko_neostar_455             { category: "modules", brand: "Aiko", wp: 455, eff: 22.8, ... }
│   ├── inv_fronius_gen24_6kw            { category: "inverters", kw: 6.0, mppt: 2, vDcMax: 1000, ... }
│   ├── bat_byd_hvs_10_2                 { category: "batteries", kwh: 10.24, type: "LFP Alta Tensión", ... }
│   └── mi_enphase_iq8hc                 { category: "microinverters", kw: 0.384, ... }
│
├── organizations/{orgId}/               <-- Espacio privado de la Empresa o Instalador
│   │
│   ├── profile/settings                 { companyName, cif, logoUrl, defaultMargin, geminiApiKey }
│   │
│   ├── custom_equipment/{eqId}          <-- Equipos incorporados por la empresa (manual / IA / web)
│   │   ├── id: "mod_web_173000..."
│   │   ├── category: "modules"
│   │   ├── brand: "JA Solar"
│   │   ├── model: "DeepBlue 4.0 Pro"
│   │   ├── ownerUid: "uid_usuario"
│   │   ├── createdAt: timestamp
│   │   └── updatedAt: timestamp
│   │
│   ├── custom_structures/{structId}     <-- Catálogo propio de estructuras, zapatas y perfiles
│   │   ├── id: "struct_coplanar_custom"
│   │   ├── name: "Subestructura Lastrada 15° Sur"
│   │   ├── costPerModule: 38.5
│   │   └── windLoadRating: "Zona C - 28 m/s"
│   │
│   └── rate_templates/{tariffId}        <-- Tarifas eléctricas personalizadas (2.0TD / 3.0TD)
│
└── projects/{projectId}                 <-- Gemelos digitales 3D y archivos de proyecto .raproject
    ├── meta: { id, name, location, kwp, updatedAt, ownerId, orgId }
    ├── layout: { polylines, planes, panels, obstacles, buildings }
    ├── electrical: { strings, inverters, cables, mpptConfig }
    └── financials: { capex, opex, van, tir, payback }
```

---

## 3. ⚡ Arquitectura de Sincronización "Offline-First"

```
[ Arranque Aplicación ]
          │
          ▼
1. Carga O(1) desde localStorage (Zero-Lag, sin esperar red)
          │
          ▼
2. ¿Hay sesión Firebase Auth activa?
   ├── NO  --> Opera en modo local autónomo (localStorage)
   └── SÍ  --> Dispara en segundo plano: RA.Firebase.syncCatalogWithCloud()
          │
          ▼
3. Descarga incremental de documentos (where updatedAt > lastSyncTimestamp)
          │
          ▼
4. Merge en memoria: global_equipment + organizations/{orgId}/custom_equipment
          │
          ▼
5. Notificación reactiva: populateStep3EquipmentSelectors() + Toast discreto
```

### Mutaciones en Caliente:
- **Al añadir/editar equipo:** Se guarda inmediatamente en `localStorage` (para disponibilidad instantánea) y se despacha una promesa en segundo plano a Firestore:
  ```javascript
  await _db.collection(`organizations/${orgId}/custom_equipment`).doc(item.id).set(item, { merge: true });
  ```
- **Al eliminar equipo:** Se elimina de `localStorage` y se marca como borrado (`deleted: true`) o se borra el documento en Firestore.

---

## 4. 🛡️ Reglas de Seguridad (`firestore.rules`)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Función auxiliar: verifica usuario autenticado
    function isAuthenticated() {
      return request.auth != null;
    }

    // Función auxiliar: verifica pertenencia a la organización
    function belongsToOrg(orgId) {
      return isAuthenticated() && (
        request.auth.uid == orgId ||
        request.auth.token.orgId == orgId
      );
    }

    // 1. Catálogo Maestro Global (Solo lectura para usuarios autenticados)
    match /global_equipment/{item} {
      allow read: if isAuthenticated();
      allow write: if isAuthenticated() && request.auth.token.admin == true;
    }

    // 2. Recursos privados de la Organización (Equipos, estructuras, tarifas)
    match /organizations/{orgId}/{document=**} {
      allow read, write: if belongsToOrg(orgId);
    }

    // 3. Proyectos 3D y Diseños Fotovoltaicos
    match /projects/{projectId} {
      allow read: if isAuthenticated() && (
        resource.data.ownerId == request.auth.uid ||
        belongsToOrg(resource.data.orgId)
      );
      allow create: if isAuthenticated();
      allow update, delete: if isAuthenticated() && (
        resource.data.ownerId == request.auth.uid ||
        belongsToOrg(resource.data.orgId)
      );
    }
  }
}
```

---

## 5. 📅 Fases de Implementación y Roadmap

### Fase 1: Extensión del Servicio Firebase
- **Archivo:** `js/firebase-service.js`
- **Tareas:**
  - Implementar `uploadEquipmentToCloud(item)`.
  - Implementar `deleteEquipmentFromCloud(category, id)`.
  - Implementar `fetchCloudEquipmentCatalog(orgId)`.
  - Implementar `syncCatalogWithCloud()` con resolución de timestamps.

### Fase 2: Ganchos Reactivos en el Catálogo
- **Archivo:** `js/working-plane.js`
- **Tareas:**
  - Enlazar `saveEquipmentCatalog()` con la sincronización asíncrona en la nube.
  - Hidratación inicial en `initEquipmentCatalog()` al recibir el evento `onFirebaseAuthStateChanged`.

### Fase 3: Interfaz de Usuario y Feedback
- **Archivo:** `index.html` (modal `#ra-equipment-catalog-modal`)
- **Tareas:**
  - Indicador visual de sincronización en la cabecera del modal:
    - `☁️ Nube Sincronizada` (verde).
    - `🔄 Sincronizando...` (azul animado).
    - `💾 Modo Local` (gris).
  - Botón opcional: *"Forzar sincronización ahora"*.

### Fase 4: Pruebas y Validación Automatizada
- **Archivo:** `tests/test-firebase-catalog-sync.js`
- **Tareas:**
  - Test de carga offline fallback cuando no hay conexión.
  - Test de merge de catálogo global + catálogo privado sin duplicados.
  - Test de persistencia y emisión de eventos de sincronización.
