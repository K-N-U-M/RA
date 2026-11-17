/**
 * js/firebase-service.js — Servicio Centralizado de Firebase (Auth, Firestore, Storage)
 * ===================================================================================
 * Conecta el visor fotovoltaico RA con la nube de Google Firebase sin alterar
 * el funcionamiento offline existente (arquitectura de sincronización híbrida).
 *
 * Responsabilidades:
 *  - Carga diferida y segura del SDK de Firebase v10+ (modular / compat).
 *  - Inicialización con detección automática de credenciales (`window.RA_FIREBASE_CONFIG`).
 *  - Autenticación: Google OAuth, Email/Password, estado de sesión reactivo.
 *  - Firestore: Sincronización de proyectos en la nube (`projects/{projectId}`).
 *  - Storage: Subida y descarga de gemelos 3D `.raproject` y PDFs bancables.
 *  - Fallback transparente a localStorage cuando no hay credenciales o conexión.
 * ===================================================================================
 */
(function(global) {
  'use strict';

  // Configuración de Firebase: busca en window o en localStorage
  const CONFIG_STORAGE_KEY = 'ra_firebase_config';
  let _firebaseApp = null;
  let _auth = null;
  let _db = null;
  let _storage = null;
  let _currentUser = null;
  let _initialized = false;

  // [AUD-2026 · B-04] Configuración desde js/ra-env.js (no versionado). Sin literales.
  const DEFAULT_FIREBASE_CONFIG = (typeof window !== 'undefined' && window.RA_ENV && window.RA_ENV.firebase)
    ? window.RA_ENV.firebase
    : { apiKey: '', authDomain: '', projectId: '', storageBucket: '', messagingSenderId: '', appId: '' };

  function getStoredConfig() {
    if (global.RA_FIREBASE_CONFIG && typeof global.RA_FIREBASE_CONFIG === 'object') {
      return global.RA_FIREBASE_CONFIG;
    }
    try {
      const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch(e) {}
    return DEFAULT_FIREBASE_CONFIG;
  }

  function setStoredConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') {
      localStorage.removeItem(CONFIG_STORAGE_KEY);
      global.RA_FIREBASE_CONFIG = null;
      return;
    }
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(cfg));
    global.RA_FIREBASE_CONFIG = cfg;
  }

  /**
   * Carga dinámica de los scripts de Firebase Compat para máxima compatibilidad con Cesium y WebGL
   */
  async function loadFirebaseScripts() {
    if (global.firebase && global.firebase.firestore && global.firebase.storage) {
      return true;
    }

    const scripts = [
      'https://www.gstatic.com/firebasejs/10.9.0/firebase-app-compat.js',
      'https://www.gstatic.com/firebasejs/10.9.0/firebase-auth-compat.js',
      'https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore-compat.js',
      'https://www.gstatic.com/firebasejs/10.9.0/firebase-storage-compat.js'
    ];

    for (const src of scripts) {
      if (document.querySelector(`script[src="${src}"]`)) continue;
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = false;
        s.onload = () => resolve();
        s.onerror = (err) => reject(new Error('Error al cargar ' + src));
        document.head.appendChild(s);
      });
    }

    return true;
  }

  /**
   * Inicializa Firebase con la configuración provista
   */
  async function initFirebase(customConfig) {
    const config = customConfig || getStoredConfig();
    if (!config || !config.apiKey || !config.projectId) {
      console.info('[RA Firebase] No hay configuración activa. Modo Local/Offline.');
      return false;
    }

    try {
      await loadFirebaseScripts();

      if (!global.firebase.apps.length) {
        _firebaseApp = global.firebase.initializeApp(config);
      } else {
        _firebaseApp = global.firebase.app();
      }

      _auth = global.firebase.auth();
      _db = global.firebase.firestore();
      _storage = global.firebase.storage();

      // Habilitar persistencia offline en Firestore para tolerar cortes de red
      try {
        await _db.enablePersistence({ synchronizeTabs: true });
      } catch(ePersist) {
        // En navegadores con pestañas concurrentes o modo incógnito puede advertir
        if (ePersist.code !== 'failed-precondition' && ePersist.code !== 'unimplemented') {
          console.warn('[RA Firebase] Firestore offline persistence:', ePersist.message);
        }
      }

      // Escuchar cambios de sesión
      _auth.onAuthStateChanged(user => {
        _currentUser = user;
        updateAuthUI(user);
        if (typeof global.onFirebaseAuthStateChanged === 'function') {
          global.onFirebaseAuthStateChanged(user);
        }
      });

      _initialized = true;
      if (typeof window.showToast === 'function') {
        window.showToast('NUBE CONECTADA', `Firebase conectado: ${config.projectId}`, 'success', 3000);
      }
      return true;
    } catch(err) {
      console.error('[RA Firebase] Error de inicialización:', err);
      if (typeof window.showToast === 'function') {
        window.showToast('ERROR FIREBASE', 'No se pudo conectar con Firebase: ' + err.message, 'error', 4500);
      }
      return false;
    }
  }

  // ── Autenticación ──────────────────────────────────────────────────────────
  async function loginWithGoogle() {
    if (!_auth) {
      openConfigModal();
      return;
    }
    const provider = new global.firebase.auth.GoogleAuthProvider();
    return _auth.signInWithPopup(provider);
  }

  async function loginWithEmail(email, password) {
    if (!_auth) { openConfigModal(); return; }
    return _auth.signInWithEmailAndPassword(email, password);
  }

  async function registerWithEmail(email, password) {
    if (!_auth) { openConfigModal(); return; }
    return _auth.createUserWithEmailAndPassword(email, password);
  }

  async function logout() {
    if (_auth) return _auth.signOut();
  }

  // ── Firestore: Guardar y Cargar Proyectos ───────────────────────────────────
  async function saveProjectToCloud(projectData, customId) {
    if (!_db) {
      throw new Error('Firebase Firestore no está inicializado.');
    }
    const user = _currentUser;
    if (!user) {
      throw new Error('Inicia sesión para guardar proyectos en la nube.');
    }
    const userId = user.uid;
    const userEmail = user.email || '';

    const cleanData = global.RAProjectStorage ? global.RAProjectStorage.exportProjectData() : projectData;
    const generatedId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? 'proj_' + crypto.randomUUID()
      : ('proj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
    const projectId = customId || (cleanData.meta && cleanData.meta.id) || generatedId;

    // [AUD-2026 · B-06] `ownerId` en la RAÍZ: es el campo que validan las reglas
    // (`request.resource.data.ownerId`). Antes solo se escribía en `meta.ownerId`,
    // por lo que TODA creación era denegada y la consulta por ownerId no devolvía nada.
    cleanData.ownerId = userId;
    cleanData.ownerEmail = userEmail;
    cleanData.tenantId = (user.tenantId || null);

    cleanData.meta = cleanData.meta || {};
    cleanData.meta.id = projectId;
    cleanData.meta.updatedAt = new Date().toISOString();
    cleanData.meta.ownerId = userId;
    cleanData.meta.ownerEmail = userEmail;

    // Guardar documento ligero en Firestore
    await _db.collection('projects').doc(projectId).set(cleanData, { merge: true });

    if (typeof window.showToast === 'function') {
      window.showToast('GUARDADO EN NUBE', `Proyecto "${cleanData.meta.name || 'Solar'}" sincronizado en Firestore.`, 'success', 3000);
    }
    return projectId;
  }

  async function loadProjectFromCloud(projectId) {
    if (!_db) throw new Error('Firebase Firestore no está inicializado.');
    if (!_currentUser) throw new Error('Inicia sesión para descargar proyectos.');
    const doc = await _db.collection('projects').doc(projectId).get();
    if (!doc.exists) {
      throw new Error('El proyecto no existe en la nube.');
    }
    const data = doc.data();
    // [AUD-2026 · B-06] Defensa en profundidad: no confiar solo en las reglas.
    if (data.ownerId && data.ownerId !== _currentUser.uid) {
      throw new Error('No tienes permiso para abrir este proyecto.');
    }
    if (global.RAProjectStorage && typeof global.RAProjectStorage.importProjectData === 'function') {
      global.RAProjectStorage.importProjectData(data);
    }
    if (typeof window.showToast === 'function') {
      window.showToast('PROYECTO DESCARGADO', `Proyecto cargado desde Firestore.`, 'success', 2500);
    }
    return data;
  }

  async function listCloudProjects() {
    if (!_db) return [];
    const user = _currentUser;
    // [AUD-2026] Sin sesión no se consulta la colección (antes se listaba todo).
    if (!user) return [];
    const snap = await _db.collection('projects')
      .where('ownerId', '==', user.uid)
      .orderBy('meta.updatedAt', 'desc')
      .limit(20)
      .get();
    const list = [];
    snap.forEach(doc => {
      list.push({ id: doc.id, ...doc.data() });
    });
    return list;
  }

  // ── Storage: Subida de Memorias PDF y Archivos Pesados ───────────────────────
  async function uploadPDFToStorage(pdfBlob, filename, projectId) {
    if (!_storage) throw new Error('Firebase Storage no está inicializado.');
    const user = _currentUser;
    const userId = user ? user.uid : 'anon';
    const projId = projectId || 'shared';
    const path = `projects/${userId}/${projId}/${filename || ('memoria_' + Date.now() + '.pdf')}`;
    const ref = _storage.ref().child(path);
    const snap = await ref.put(pdfBlob, { contentType: 'application/pdf' });
    const downloadUrl = await snap.ref.getDownloadURL();
    return { path, downloadUrl };
  }

  // ── Interfaz de Usuario y Configuración ────────────────────────────────────
  function updateAuthUI(user) {
    const btn = document.getElementById('ra-cloud-sync-btn');
    if (btn) {
      if (user) {
        btn.innerHTML = `<i data-lucide="cloud-check" class="icon-sm"></i>`;
        btn.style.borderColor = '#10B981';
        btn.style.color = '#34D399';
        btn.title = `Conectado como ${user.email} (Clic para gestionar)`;
      } else {
        btn.innerHTML = `<i data-lucide="cloud" class="icon-sm"></i>`;
        btn.style.borderColor = 'rgba(56,189,248,0.4)';
        btn.style.color = '#38BDF8';
        btn.title = 'Conectar con Firebase (Cloud Sync)';
      }
      if (global.lucide && typeof global.lucide.createIcons === 'function') global.lucide.createIcons();
    }
  }

  function openConfigModal() {
    let modal = document.getElementById('ra-firebase-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'ra-firebase-modal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.85);backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:Inter,sans-serif;';
      document.body.appendChild(modal);
    }

    const cur = getStoredConfig() || {};
    const user = _currentUser;
    const _escFb = (v) => (global.RASanitize && typeof global.RASanitize.plain === 'function')
      ? global.RASanitize.plain(v)
      : String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    modal.innerHTML = `
      <div style="background:#0F172A;border:1px solid rgba(56,189,248,0.3);border-radius:12px;padding:24px;width:440px;max-width:92vw;box-shadow:0 20px 40px rgba(0,0,0,0.8);color:#F1F5F9;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="color:#F59E0B;font-size:20px;">🔥</span>
            <h3 style="margin:0;font-size:15px;font-weight:800;letter-spacing:0.02em;">FIREBASE CLOUD SYNC</h3>
          </div>
          <button type="button" onclick="document.getElementById('ra-firebase-modal').style.display='none'" style="background:transparent;border:none;color:#94A3B8;cursor:pointer;font-size:18px;">&times;</button>
        </div>

        ${user ? `
          <div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:8px;padding:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:12px;font-weight:700;color:#34D399;">Sesión Iniciada</div>
              <div style="font-size:11px;color:#94A3B8;">${_escFb(user.email || '')}</div>
            </div>
            <button type="button" onclick="RAFirebaseService.logout()" class="doc-mini-btn" style="background:rgba(239,68,68,0.2);color:#F87171;border-color:rgba(239,68,68,0.4);padding:4px 8px;">Cerrar Sesión</button>
          </div>
          <div style="display:flex;gap:8px;margin-bottom:16px;">
            <button type="button" onclick="RAFirebaseService.saveProjectToCloud()" class="doc-mini-btn" style="flex:1;background:rgba(16,185,129,0.25);border-color:#10B981;color:#fff;padding:8px;text-align:center;font-weight:700;">☁️ Guardar Proyecto en Firestore</button>
          </div>
        ` : `
          <div style="margin-bottom:16px;display:flex;flex-direction:column;gap:8px;">
            <button type="button" onclick="RAFirebaseService.loginWithGoogle()" style="width:100%;padding:10px;background:#FFFFFF;color:#0F172A;border:none;border-radius:6px;font-weight:700;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
              <span>Iniciar con Google</span>
            </button>
          </div>
        `}

        <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:12px;margin-top:12px;">
          <div style="font-size:11px;font-weight:700;color:#38BDF8;margin-bottom:8px;">Configuración de Proyecto Firebase (JSON / Web SDK)</div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            <input id="ra-fb-apikey" type="text" placeholder="apiKey" value="${_escFb(cur.apiKey || '')}" style="background:#1E293B;border:1px solid #334155;border-radius:4px;padding:6px;color:#fff;font-size:11px;">
            <input id="ra-fb-projectid" type="text" placeholder="projectId" value="${_escFb(cur.projectId || '')}" style="background:#1E293B;border:1px solid #334155;border-radius:4px;padding:6px;color:#fff;font-size:11px;">
            <input id="ra-fb-authdomain" type="text" placeholder="authDomain" value="${_escFb(cur.authDomain || '')}" style="background:#1E293B;border:1px solid #334155;border-radius:4px;padding:6px;color:#fff;font-size:11px;">
            <input id="ra-fb-storagebucket" type="text" placeholder="storageBucket" value="${_escFb(cur.storageBucket || '')}" style="background:#1E293B;border:1px solid #334155;border-radius:4px;padding:6px;color:#fff;font-size:11px;">
          </div>
          <div style="display:flex;gap:8px;margin-top:12px;">
            <button type="button" onclick="RAFirebaseService.saveConfigFromModal()" style="flex:1;background:#0284C7;color:#fff;border:none;border-radius:6px;padding:8px;font-size:11px;font-weight:700;cursor:pointer;">Guardar y Conectar</button>
          </div>
        </div>
      </div>
    `;

    modal.style.display = 'flex';
  }

  function saveConfigFromModal() {
    const cfg = {
      apiKey: (document.getElementById('ra-fb-apikey') || {}).value?.trim(),
      projectId: (document.getElementById('ra-fb-projectid') || {}).value?.trim(),
      authDomain: (document.getElementById('ra-fb-authdomain') || {}).value?.trim(),
      storageBucket: (document.getElementById('ra-fb-storagebucket') || {}).value?.trim()
    };
    if (!cfg.apiKey || !cfg.projectId) {
      if (typeof window.showToast === 'function') window.showToast('CAMPOS INCOMPLETOS', 'Se requiere al menos apiKey y projectId.', 'warning', 3000);
      return;
    }
    setStoredConfig(cfg);
    initFirebase(cfg).then(ok => {
      if (ok) {
        const modal = document.getElementById('ra-firebase-modal');
        if (modal) modal.style.display = 'none';
      }
    });
  }

  // Auto-inicializar si ya existen credenciales guardadas
  setTimeout(() => {
    const existing = getStoredConfig();
    if (existing) initFirebase(existing);
  }, 1000);

  const RAFirebaseService = {
    initFirebase,
    getStoredConfig,
    setStoredConfig,
    loginWithGoogle,
    loginWithEmail,
    registerWithEmail,
    logout,
    saveProjectToCloud,
    loadProjectFromCloud,
    listCloudProjects,
    uploadPDFToStorage,
    openConfigModal,
    saveConfigFromModal,
    isInitialized: () => _initialized,
    getUser: () => _currentUser
  };

  global.RAFirebaseService = RAFirebaseService;
  global.RA = global.RA || {};
  global.RA.Firebase = RAFirebaseService;

})(typeof window !== 'undefined' ? window : this);
