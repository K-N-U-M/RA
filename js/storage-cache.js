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
          return reject(new Error('IndexedDB no soportado en este navegador'));
        }

        const request = global.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
            db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(STORE_ASSETS)) {
            db.createObjectStore(STORE_ASSETS, { keyPath: 'url' });
          }
        };

        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
      });
    }
    return dbPromise;
  }

  const RAStorageCache = {
    /**
     * Guarda un proyecto con su gemelo digital sin límite de tamaño
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
          const req = store.put(payload);
          req.onsuccess = () => resolve(true);
          req.onerror = () => reject(req.error);
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
          const req = store.put({ url: url, blob: dataBlob, cachedAt: Date.now() });
          req.onsuccess = () => resolve(true);
          req.onerror = () => reject(req.error);
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
    }
  };

  global.RAStorageCache = RAStorageCache;

})(typeof window !== 'undefined' ? window : this);
