// Where levels live while you are working on them.
//
// IndexedDB is the real store. Browsers block IndexedDB when a page is opened
// straight off the filesystem (file://), so there is a localStorage fallback
// and the app tells you which one it got — silently losing work because the
// storage layer failed is the worst possible outcome here.

(function () {
  "use strict";

  const DB_NAME = "amy_food_game_editor";
  const DB_VERSION = 2;
  const STORE = "levels";
  const META = "meta";
  // Imported pictures. Separate because a level snapshot goes into the undo
  // stack 60 deep and into storage on every autosave — see
  // docs/BACKGROUND_PICTURES.md.
  const IMAGES = "images";
  const LS_PREFIX = "afg_editor:";

  let db = null;
  let mode = "none"; // "indexeddb" | "localstorage" | "none"

  function openDB() {
    return new Promise(function (resolve) {
      if (!window.indexedDB) return resolve(null);
      let req;
      try {
        req = window.indexedDB.open(DB_NAME, DB_VERSION);
      } catch (err) {
        return resolve(null);
      }
      req.onupgradeneeded = function () {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE, { keyPath: "id" });
        }
        if (!d.objectStoreNames.contains(META)) {
          d.createObjectStore(META, { keyPath: "key" });
        }
        if (!d.objectStoreNames.contains(IMAGES)) {
          d.createObjectStore(IMAGES, { keyPath: "id" });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
      req.onblocked = function () { resolve(null); };
      // Some browsers neither resolve nor error on file://; don't hang forever.
      setTimeout(function () { resolve(req.result || null); }, 2500);
    });
  }

  function tx(storeName, writable) {
    return db.transaction(storeName, writable ? "readwrite" : "readonly")
      .objectStore(storeName);
  }

  function wrap(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  // ---------------------------------------------------------------- fallback
  function lsAvailable() {
    try {
      window.localStorage.setItem(LS_PREFIX + "probe", "1");
      window.localStorage.removeItem(LS_PREFIX + "probe");
      return true;
    } catch (err) {
      return false;
    }
  }

  function lsKeys() {
    const out = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.indexOf(LS_PREFIX + "level:") === 0) out.push(k);
    }
    return out;
  }

  // ---------------------------------------------------------------- API
  const Storage = {
    mode: function () { return mode; },

    async init() {
      db = await openDB();
      if (db) {
        mode = "indexeddb";
      } else if (lsAvailable()) {
        mode = "localstorage";
      } else {
        mode = "none";
      }
      return mode;
    },

    async listLevels() {
      if (mode === "indexeddb") {
        const rows = await wrap(tx(STORE).getAll());
        return rows.sort(function (a, b) {
          return (a.order || 0) - (b.order || 0);
        });
      }
      if (mode === "localstorage") {
        return lsKeys()
          .map(function (k) {
            try { return JSON.parse(window.localStorage.getItem(k)); }
            catch (err) { return null; }
          })
          .filter(Boolean)
          .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      }
      return [];
    },

    async saveLevel(record) {
      if (mode === "indexeddb") {
        await wrap(tx(STORE, true).put(record));
        return true;
      }
      if (mode === "localstorage") {
        try {
          window.localStorage.setItem(
            LS_PREFIX + "level:" + record.id, JSON.stringify(record));
          return true;
        } catch (err) {
          return false;
        }
      }
      return false;
    },

    async getLevel(id) {
      if (mode === "indexeddb") return (await wrap(tx(STORE).get(id))) || null;
      if (mode === "localstorage") {
        try {
          return JSON.parse(window.localStorage.getItem(LS_PREFIX + "level:" + id));
        } catch (err) { return null; }
      }
      return null;
    },

    async deleteLevel(id) {
      if (mode === "indexeddb") {
        await wrap(tx(STORE, true).delete(id));
        return true;
      }
      if (mode === "localstorage") {
        window.localStorage.removeItem(LS_PREFIX + "level:" + id);
        return true;
      }
      return false;
    },

    // ------------------------------------------------------------ pictures
    // {id, name, data (a PNG/JPEG data URL), w, h}.
    async listImages() {
      if (mode === "indexeddb") return (await wrap(tx(IMAGES).getAll())) || [];
      if (mode === "localstorage") {
        const out = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (!k || k.indexOf(LS_PREFIX + "image:") !== 0) continue;
          try { out.push(JSON.parse(window.localStorage.getItem(k))); }
          catch (err) { /* skip a corrupt entry rather than lose the rest */ }
        }
        return out.filter(Boolean);
      }
      return [];
    },

    async saveImage(record) {
      if (mode === "indexeddb") {
        try {
          await wrap(tx(IMAGES, true).put(record));
          return true;
        } catch (err) {
          return false;   // over quota; the caller says so out loud
        }
      }
      if (mode === "localstorage") {
        try {
          window.localStorage.setItem(
            LS_PREFIX + "image:" + record.id, JSON.stringify(record));
          return true;
        } catch (err) {
          return false;
        }
      }
      return false;
    },

    async deleteImage(id) {
      if (mode === "indexeddb") {
        await wrap(tx(IMAGES, true).delete(id));
        return true;
      }
      if (mode === "localstorage") {
        window.localStorage.removeItem(LS_PREFIX + "image:" + id);
        return true;
      }
      return false;
    },

    async setMeta(key, value) {
      if (mode === "indexeddb") {
        await wrap(tx(META, true).put({ key: key, value: value }));
        return;
      }
      if (mode === "localstorage") {
        try {
          window.localStorage.setItem(LS_PREFIX + "meta:" + key, JSON.stringify(value));
        } catch (err) { /* full or blocked; not fatal */ }
      }
    },

    async getMeta(key, fallback) {
      if (mode === "indexeddb") {
        const row = await wrap(tx(META).get(key));
        return row ? row.value : fallback;
      }
      if (mode === "localstorage") {
        try {
          const raw = window.localStorage.getItem(LS_PREFIX + "meta:" + key);
          return raw === null ? fallback : JSON.parse(raw);
        } catch (err) { return fallback; }
      }
      return fallback;
    },
  };

  window.Storage = Storage;
})();
