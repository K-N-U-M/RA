/**
 * js/autosave-idb.js
 * Autosave silencioso en IndexedDB (ra_autosave_db) cada 60 segundos
 * usando window.exportRAProjectData() si existe. Expone window.RAAutosave.
 */
(function () {
    'use strict';

    var DB_NAME = 'ra_autosave_db';
    var DB_VERSION = 1;
    var STORE_NAME = 'snapshots';
    var SNAPSHOT_KEY = 'latest';
    var INTERVAL_MS = 60000;

    var _timerId = null;

    function openDB() {
        return new Promise(function (resolve, reject) {
            if (typeof indexedDB === 'undefined') {
                reject(new Error('IndexedDB no disponible'));
                return;
            }
            var req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = function (e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
            req.onsuccess = function (e) {
                resolve(e.target.result);
            };
            req.onerror = function (e) {
                reject(e.target.error || new Error('Error abriendo IndexedDB'));
            };
        });
    }

    function saveSnapshot() {
        if (typeof window.exportRAProjectData !== 'function') {
            return Promise.resolve(false);
        }
        var data;
        try {
            data = window.exportRAProjectData();
        } catch (err) {
            return Promise.resolve(false);
        }
        if (!data) return Promise.resolve(false);

        return openDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(STORE_NAME, 'readwrite');
                var store = tx.objectStore(STORE_NAME);
                store.put({
                    id: SNAPSHOT_KEY,
                    timestamp: Date.now(),
                    payload: data
                });
                tx.oncomplete = function () {
                    db.close();
                    resolve(true);
                };
                tx.onerror = function (e) {
                    db.close();
                    reject(e.target.error);
                };
            });
        }).catch(function () {
            return false;
        });
    }

    function loadSnapshot() {
        return openDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(STORE_NAME, 'readonly');
                var store = tx.objectStore(STORE_NAME);
                var req = store.get(SNAPSHOT_KEY);
                req.onsuccess = function (e) {
                    db.close();
                    resolve(e.target.result || null);
                };
                req.onerror = function (e) {
                    db.close();
                    reject(e.target.error);
                };
            });
        }).catch(function () {
            return null;
        });
    }

    function clearSnapshot() {
        return openDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(STORE_NAME, 'readwrite');
                var store = tx.objectStore(STORE_NAME);
                store.delete(SNAPSHOT_KEY);
                tx.oncomplete = function () {
                    db.close();
                    resolve(true);
                };
                tx.onerror = function (e) {
                    db.close();
                    reject(e.target.error);
                };
            });
        }).catch(function () {
            return false;
        });
    }

    function start() {
        if (_timerId !== null) return;
        _timerId = setInterval(saveSnapshot, INTERVAL_MS);
    }

    function stop() {
        if (_timerId !== null) {
            clearInterval(_timerId);
            _timerId = null;
        }
    }

    if (typeof window !== 'undefined') {
        window.RAAutosave = {
            saveSnapshot: saveSnapshot,
            loadSnapshot: loadSnapshot,
            clearSnapshot: clearSnapshot,
            start: start,
            stop: stop
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', start);
        } else {
            start();
        }
    }
})();
