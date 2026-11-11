/**
 * 圖片庫儲存層（IndexedDB）：保存使用者上傳過的圖片。
 * 記錄結構：{ id, name, size, type, blob, createdAt }
 * 掛到 window.BeadImageStore。
 */
(function (root) {
  'use strict';

  var DB_NAME = 'pixel-pindo';
  var DB_VERSION = 1;
  var STORE = 'images';
  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!root.indexedDB) {
        reject(new Error('此瀏覽器不支援 IndexedDB'));
        return;
      }
      var req = root.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('開啟資料庫失敗')); };
    });
    return dbPromise;
  }

  function tx(mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode);
        var store = t.objectStore(STORE);
        var result;
        try {
          result = fn(store);
        } catch (err) {
          reject(err);
          return;
        }
        t.oncomplete = function () { resolve(result && result.__req ? result.__req.result : result); };
        t.onerror = function () { reject(t.error || new Error('資料庫交易失敗')); };
        t.onabort = function () { reject(t.error || new Error('資料庫交易中止')); };
      });
    });
  }

  function genId() {
    return 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  /** 新增一筆（回傳含 id 的記錄） */
  function add(record) {
    var item = {
      id: record.id || genId(),
      name: record.name || '未命名圖片',
      size: record.size || (record.blob ? record.blob.size : 0),
      type: record.type || (record.blob ? record.blob.type : 'image/*'),
      blob: record.blob,
      gridW: record.gridW || null,
      gridH: record.gridH || null,
      crop: record.crop || null,
      createdAt: record.createdAt || Date.now()
    };
    return tx('readwrite', function (store) { return store.add(item); }).then(function () { return item; });
  }

  /** 更新一筆（用於記錄尺寸等） */
  function put(record) {
    return tx('readwrite', function (store) { return store.put(record); }).then(function () { return record; });
  }

  /** 取得全部，依建立時間新→舊 */
  function listAll() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, 'readonly');
        var req = t.objectStore(STORE).getAll();
        req.onsuccess = function () {
          var arr = (req.result || []).sort(function (a, b) { return b.createdAt - a.createdAt; });
          resolve(arr);
        };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function get(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function remove(id) {
    return tx('readwrite', function (store) { return store.delete(id); }).then(function () { return true; });
  }

  function clearAll() {
    return tx('readwrite', function (store) { return store.clear(); }).then(function () { return true; });
  }

  /** Blob → HTMLImageElement */
  function blobToImage(blob) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function (e) { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  /** Blob → 縮圖 dataURL（用於列表預覽） */
  function blobToThumb(blob, maxSize) {
    maxSize = maxSize || 96;
    return blobToImage(blob).then(function (img) {
      var scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      var w = Math.max(1, Math.round(img.width * scale));
      var h = Math.max(1, Math.round(img.height * scale));
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      return canvas.toDataURL('image/png');
    });
  }

  root.BeadImageStore = {
    add: add,
    put: put,
    listAll: listAll,
    get: get,
    remove: remove,
    clearAll: clearAll,
    blobToImage: blobToImage,
    blobToThumb: blobToThumb,
    isSupported: function () { return !!root.indexedDB; }
  };
})(typeof self !== 'undefined' ? self : globalThis);
