/**
 * ============================================================================
 * 💾 RA STORAGE CACHE — PERSISTENCIA ASÍNCRONA INDEXEDDB INDUSTRIAL AAA
 * Despensa de ultra-velocidad:
 * Reemplaza los cuellos de botella y el límite de 5-10MB de localStorage
 * por almacenamiento asíncrono multi-gigabyte sin bloqueos en el hilo principal.
 * ============================================================================
 */

(function(global) {
  'use strict';

  const DB_NAME = 'RA_Storage_DB';
  const DB_VERSION = 1;
  const STORE_PROJECTS = 'projects';
  const STORE_ASSETS = 'assets_cache';

  let dbPromise = null;

  function getDB() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (!global.indexedDB) {
          dbPromise = null;
          return reject(new Error('IndexedDB no soportado en este navegador'));
        }

        let request;
        try {
          request = global.indexedDB.open(DB_NAME, DB_VERSION);
        } catch (openErr) {
          dbPromise = null;
          return reject(openErr);
        }

        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
            db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(STORE_ASSETS)) {
            db.createObjectStore(STORE_ASSETS, { keyPath: 'url' });
          }
        };

        request.onblocked = () => {
          dbPromise = null;
          reject(new Error('Apertura de IndexedDB bloqueada por otra pestaña'));
        };

        request.onsuccess = (e) => {
          const db = e.target.result;
          if (db) {
            db.onversionchange = () => {
              try { db.close(); } catch (_) {}
              dbPromise = null;
            };
          }
          resolve(db);
        };
        request.onerror = (e) => {
          dbPromise = null;
          reject((e && e.target && e.target.error) || new Error('Error abriendo IndexedDB'));
        };
      }).catch((err) => {
        dbPromise = null;
        throw err;
      });
    }
    return dbPromise;
  }

  const RAStorageCache = {
    /**
     * Guarda un proyecto con su gemelo digital sin límite de tamaño (espera commit real de transacción)
     */
    saveProjectAsync: async function(projectId, projectData) {
      try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_PROJECTS, 'readwrite');
          const store = tx.objectStore(STORE_PROJECTS);
          const payload = {
            id: projectId,
            updatedAt: Date.now(),
            data: projectData
          };
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error || new Error('Transacción abortada'));
          store.put(payload);
        });
      } catch (err) {
        console.warn('[RAStorageCache] Fallback a localStorage para proyecto:', err);
        try {
          localStorage.setItem('ra_proj_' + projectId, JSON.stringify(projectData));
          return true;
        } catch(e) {
          return false;
        }
      }
    },

    /**
     * Recupera un proyecto de IndexedDB
     */
    loadProjectAsync: async function(projectId) {
      try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_PROJECTS, 'readonly');
          const store = tx.objectStore(STORE_PROJECTS);
          const req = store.get(projectId);
          req.onsuccess = () => {
            if (req.result && req.result.data) {
              resolve(req.result.data);
            } else {
              resolve(null);
            }
          };
          req.onerror = () => reject(req.error);
        });
      } catch (err) {
        console.warn('[RAStorageCache] Fallback a localStorage para carga:', err);
        try {
          const raw = localStorage.getItem('ra_proj_' + projectId);
          return raw ? JSON.parse(raw) : null;
        } catch(e) {
          return null;
        }
      }
    },

    /**
     * Guarda una textura o activo binario en caché local
     */
    cacheAssetAsync: async function(url, dataBlob) {
      try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_ASSETS, 'readwrite');
          const store = tx.objectStore(STORE_ASSETS);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error || new Error('Transacción abortada'));
          store.put({ url: url, blob: dataBlob, cachedAt: Date.now() });
        });
      } catch (e) {
        return false;
      }
    },

    /**
     * Obtiene un activo de la caché local de IndexedDB
     */
    getCachedAssetAsync: async function(url) {
      try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_ASSETS, 'readonly');
          const store = tx.objectStore(STORE_ASSETS);
          const req = store.get(url);
          req.onsuccess = () => resolve(req.result ? req.result.blob : null);
          req.onerror = () => reject(req.error);
        });
      } catch (e) {
        return null;
      }
    },

    deleteCachedAssetAsync: async function(url) {
      try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_ASSETS, 'readwrite');
          const store = tx.objectStore(STORE_ASSETS);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error || new Error('Transacción abortada'));
          store.delete(url);
        });
      } catch (e) {
        return false;
      }
    },

    deleteProjectAsync: async function(projectId) {
      try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_PROJECTS, 'readwrite');
          const store = tx.objectStore(STORE_PROJECTS);
          tx.oncomplete = () => {
            try { localStorage.removeItem('ra_proj_' + projectId); } catch (_) {}
            resolve(true);
          };
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error || new Error('Transacción abortada'));
          store.delete(projectId);
        });
      } catch (e) {
        try { localStorage.removeItem('ra_proj_' + projectId); } catch (_) {}
        return false;
      }
    },

    listProjectIdsAsync: async function() {
      try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_PROJECTS, 'readonly');
          const store = tx.objectStore(STORE_PROJECTS);
          if (typeof store.getAllKeys === 'function') {
            const req = store.getAllKeys();
            req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
            req.onerror = () => reject(req.error);
          } else {
            const keys = [];
            const cursorReq = store.openCursor();
            cursorReq.onsuccess = (ev) => {
              const cur = ev.target.result;
              if (cur) { keys.push(cur.key); cur.continue(); } else resolve(keys);
            };
            cursorReq.onerror = () => reject(cursorReq.error);
          }
        });
      } catch (e) {
        return [];
      }
    },

    purgeOrphanedProjectsAsync: async function(validIds) {
      try {
        const keep = new Set(Array.isArray(validIds) ? validIds : []);
        const allIds = await RAStorageCache.listProjectIdsAsync();
        // Solo purgar copias huérfanas del historial ('proj_*'); nunca tocar 'autosave_current' ni otras claves reservadas
        const orphans = allIds.filter((id) => typeof id === 'string' && id.indexOf('proj_') === 0 && !keep.has(id));
        for (let i = 0; i < orphans.length; i++) {
          await RAStorageCache.deleteProjectAsync(orphans[i]);
        }
        return orphans.length;
      } catch (e) {
        return 0;
      }
    }
  };

  global.RAStorageCache = RAStorageCache;

})(typeof window !== 'undefined' ? window : this);
