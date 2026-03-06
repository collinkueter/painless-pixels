/**
 * Painless Pixels — Persistence (IndexedDB + file export/import)
 *
 * Pure data layer — no DOM manipulation. Callers handle UI feedback
 * via onSave/onError callbacks.
 */
const Storage = (function () {
  'use strict';

  var DB_NAME      = 'painless-pixels';
  var STORE_NAME   = 'state';
  var SESSION_KEY  = 'session';
  var SCHEMA_VERSION = 2;

  var ALLOWED_IMAGE_TYPES = ['data:image/png', 'data:image/jpeg', 'data:image/webp', 'data:image/gif'];
  var MAX_SLIDE_DATA_LENGTH = 20 * 1024 * 1024; // 20MB per slide

  var _db = null;
  var _saveVersion = 0;
  var _idbAvailable = true;

  // Callbacks — set by App layer
  var _onSave  = null;
  var _onError = null;

  // ── IndexedDB wrapper ─────────────────────────────────────────────────

  function _openDB() {
    if (_db) return Promise.resolve(_db);
    return new Promise(function (resolve, reject) {
      try {
        var req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = function () {
          _db = req.result;
          // Handle external deletion / version change
          _db.onclose = function () { _db = null; };
          _db.onversionchange = function () { _db.close(); _db = null; };
          resolve(_db);
        };
        req.onerror = function () { reject(req.error); };
      } catch (e) {
        reject(e);
      }
    });
  }

  function _put(key, value) {
    return _openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(value, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror    = function () { reject(tx.error); };
      });
    });
  }

  function _get(key) {
    return _openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readonly');
        var req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror   = function () { reject(req.error); };
      });
    });
  }

  function _del(key) {
    return _openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror    = function () { reject(tx.error); };
      });
    });
  }

  // ── Serialization ─────────────────────────────────────────────────────

  function serialize(state) {
    return {
      _schemaVersion: SCHEMA_VERSION,
      _savedAt: new Date().toISOString(),
      slides: (state.slides || []).filter(function (s) {
        return s && _isValidSlide(s);
      }).map(function (s) {
        return {
          id:        s.id,
          imageData: s.imageData,
          title:     s.title || 'Untitled',
        };
      }),
      activeSlideIndex: state.activeSlideIndex,
      device:           state.device,
      templateId:       state.templateId,
      bgType:           state.bgType,
      bgFrom:           state.bgFrom,
      bgTo:             state.bgTo,
      bgAngle:          state.bgAngle,
      bgSolid:          state.bgSolid,
      bgSplitTop:       state.bgSplitTop,
      bgSplitBottom:    state.bgSplitBottom,
      headline:         state.headline,
      subheadline:      state.subheadline,
      headlineSize:     state.headlineSize,
      subheadlineSize:  state.subheadlineSize,
      textColor:        state.textColor,
      subheadlineColor: state.subheadlineColor,
      phoneXFrac:       state.phoneXFrac,
      phoneYFrac:       state.phoneYFrac,
      phoneAngle:       state.phoneAngle,
      headlineXFrac:    state.headlineXFrac,
      headlineYFrac:    state.headlineYFrac,
      headlineAngle:    state.headlineAngle,
      subheadlineXFrac: state.subheadlineXFrac,
      subheadlineYFrac: state.subheadlineYFrac,
      subheadlineAngle: state.subheadlineAngle,
    };
  }

  function _isValidSlide(s) {
    if (!s || typeof s.imageData !== 'string') return false;
    if (s.imageData.length > MAX_SLIDE_DATA_LENGTH) return false;
    for (var i = 0; i < ALLOWED_IMAGE_TYPES.length; i++) {
      if (s.imageData.startsWith(ALLOWED_IMAGE_TYPES[i])) return true;
    }
    return false;
  }

  function deserialize(data, defaults) {
    if (!data || typeof data !== 'object') return null;

    // Reject newer schema versions
    if (data._schemaVersion && data._schemaVersion > SCHEMA_VERSION) return null;

    // Validate slides
    var slides = Array.isArray(data.slides) ? data.slides.filter(_isValidSlide) : [];
    if (!slides.length) return null;

    return {
      _savedAt:         data._savedAt || null,
      slides:           slides.map(function (s) {
        return {
          id:        s.id || Utils.uid(),
          file:      null,
          imageData: s.imageData,
          title:     s.title || 'Untitled',
        };
      }),
      activeSlideIndex: typeof data.activeSlideIndex === 'number' ? data.activeSlideIndex : 0,
      device:           data.device || defaults.device,
      templateId:       data.templateId || defaults.templateId,
      bgType:           data.bgType || defaults.bgType,
      bgFrom:           data.bgFrom || defaults.bgFrom,
      bgTo:             data.bgTo || defaults.bgTo,
      bgAngle:          typeof data.bgAngle === 'number' ? data.bgAngle : defaults.bgAngle,
      bgSolid:          data.bgSolid || defaults.bgSolid,
      bgSplitTop:       data.bgSplitTop || defaults.bgSplitTop,
      bgSplitBottom:    data.bgSplitBottom || defaults.bgSplitBottom,
      headline:         typeof data.headline === 'string' ? data.headline : defaults.headline,
      subheadline:      typeof data.subheadline === 'string' ? data.subheadline : defaults.subheadline,
      headlineSize:     typeof data.headlineSize === 'number' ? data.headlineSize : defaults.headlineSize,
      subheadlineSize:  typeof data.subheadlineSize === 'number' ? data.subheadlineSize : defaults.subheadlineSize,
      textColor:        data.textColor || defaults.textColor,
      subheadlineColor: data.subheadlineColor || defaults.subheadlineColor,
      phoneXFrac:       typeof data.phoneXFrac === 'number' ? data.phoneXFrac : null,
      phoneYFrac:       typeof data.phoneYFrac === 'number' ? data.phoneYFrac : null,
      phoneAngle:       typeof data.phoneAngle === 'number' ? data.phoneAngle : 0,
      headlineXFrac:    typeof data.headlineXFrac === 'number' ? data.headlineXFrac : null,
      headlineYFrac:    typeof data.headlineYFrac === 'number' ? data.headlineYFrac : null,
      headlineAngle:    typeof data.headlineAngle === 'number' ? data.headlineAngle : 0,
      subheadlineXFrac: typeof data.subheadlineXFrac === 'number' ? data.subheadlineXFrac : null,
      subheadlineYFrac: typeof data.subheadlineYFrac === 'number' ? data.subheadlineYFrac : null,
      subheadlineAngle: typeof data.subheadlineAngle === 'number' ? data.subheadlineAngle : 0,
    };
  }

  // ── Auto-save ─────────────────────────────────────────────────────────

  // Stable wrapper — always delegates to the internal debounced fn
  var _debouncedSave = function () {};

  function scheduleSave(state) {
    _debouncedSave(state);
  }

  function init(opts) {
    _onSave  = (opts && opts.onSave)  || null;
    _onError = (opts && opts.onError) || null;

    _debouncedSave = Utils.debounce(function (state) {
      save(state);
    }, 1500);

    // Try to open the DB eagerly so first save is fast
    _openDB().catch(function (err) {
      _idbAvailable = false;
      if (_onError) _onError('idb-unavailable', err);
    });
  }

  function save(state) {
    if (!_idbAvailable) return Promise.resolve();
    var version = ++_saveVersion;
    var data = serialize(state);
    if (!data.slides.length) return Promise.resolve(); // don't save empty/invalid state
    return _put(SESSION_KEY, data).then(function () {
      if (version === _saveVersion && _onSave) {
        _onSave();
      }
    }).catch(function (err) {
      if (_onError) _onError('save-failed', err);
    });
  }

  function load() {
    return _get(SESSION_KEY).catch(function (err) {
      if (_onError) _onError('load-failed', err);
      return null;
    });
  }

  function clear() {
    return _del(SESSION_KEY).catch(function (err) {
      if (_onError) _onError('clear-failed', err);
    });
  }

  // ── File export/import ────────────────────────────────────────────────

  function exportFile(state, filename) {
    var data = serialize(state);
    var envelope = {
      app:     'painless-pixels',
      version: SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      state:   data,
    };
    var json = JSON.stringify(envelope);
    var blob = new Blob([json], { type: 'application/json' });
    if (typeof saveAs === 'function') {
      saveAs(blob, filename || 'design.pp');
    } else {
      // Fallback: create temporary download link
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename || 'design.pp';
      a.click();
      URL.revokeObjectURL(a.href);
    }
  }

  function importFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var parsed = JSON.parse(e.target.result);
          // Accept either envelope format or raw state
          var stateData = null;
          if (parsed.app === 'painless-pixels' && parsed.state) {
            stateData = parsed.state;
          } else if (parsed.slides) {
            stateData = parsed;
          }
          if (!stateData) {
            reject(new Error('Invalid file format'));
            return;
          }
          resolve(stateData);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsText(file);
    });
  }

  // ── Public API ────────────────────────────────────────────────────────

  return {
    init:         init,
    scheduleSave: scheduleSave,
    save:         save,
    load:         load,
    clear:        clear,
    exportFile:   exportFile,
    importFile:   importFile,
    deserialize:  deserialize,
  };
})();
