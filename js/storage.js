/**
 * Painless Pixels — Persistence (IndexedDB + file export/import)
 */
const Storage = (function () {
  'use strict';

  const DB_NAME    = 'painless-pixels';
  const STORE_NAME = 'state';
  const SESSION_KEY = 'session';
  const SCHEMA_VERSION = 2;

  let _db = null;
  let _saveVersion = 0;
  let scheduleSave = function () {}; // no-op until init()

  // ── IndexedDB wrapper ─────────────────────────────────────────────────

  function _openDB() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = () => { _db = req.result; resolve(_db); };
        req.onerror   = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  function _put(key, value) {
    return _openDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    }));
  }

  function _get(key) {
    return _openDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    }));
  }

  function _del(key) {
    return _openDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    }));
  }

  // ── Serialization ─────────────────────────────────────────────────────

  function serialize(state) {
    return {
      _schemaVersion: SCHEMA_VERSION,
      _savedAt: new Date().toISOString(),
      slides: (state.slides || []).map(s => ({
        id:        s.id,
        imageData: s.imageData,
        title:     s.title || 'Untitled',
      })),
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
      textColor:        state.textColor,
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
    return s &&
      typeof s.imageData === 'string' &&
      s.imageData.startsWith('data:image/');
  }

  function deserialize(data, defaults) {
    if (!data || typeof data !== 'object') return null;

    // Reject newer schema versions
    if (data._schemaVersion && data._schemaVersion > SCHEMA_VERSION) return null;

    // Validate slides
    var slides = Array.isArray(data.slides) ? data.slides.filter(_isValidSlide) : [];
    if (!slides.length) return null;

    return {
      slides:           slides.map(s => ({
        id:        s.id || Utils.uid(),
        file:      null,
        imageData: s.imageData,
        title:     s.title || 'Untitled',
      })),
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
      textColor:        data.textColor || defaults.textColor,
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

  function init() {
    scheduleSave = Utils.debounce(function (state) {
      save(state);
    }, 300);

    // Try to open the DB eagerly so first save is fast
    _openDB().catch(function () {
      // IDB unavailable — scheduleSave stays functional but save() will silently fail
      scheduleSave = function () {};
    });
  }

  function save(state) {
    var version = ++_saveVersion;
    var data = serialize(state);
    return _put(SESSION_KEY, data).then(function () {
      // Only show indicator if this is still the latest save
      if (version === _saveVersion) {
        _flashSaveStatus();
      }
    }).catch(function () {
      // Silently fail — IDB may be unavailable
    });
  }

  function load() {
    return _get(SESSION_KEY).catch(function () {
      return null;
    });
  }

  function clear() {
    return _del(SESSION_KEY).catch(function () {});
  }

  function _flashSaveStatus() {
    var el = document.getElementById('save-status');
    if (!el) return;
    el.textContent = 'Saved';
    el.classList.add('visible');
    setTimeout(function () {
      el.classList.remove('visible');
    }, 1500);
  }

  // ── File export/import ────────────────────────────────────────────────

  function exportFile(state) {
    var data = serialize(state);
    var envelope = {
      app:     'painless-pixels',
      version: SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      state:   data,
    };
    var json = JSON.stringify(envelope);
    var blob = new Blob([json], { type: 'application/json' });
    saveAs(blob, 'design.pp');
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
    save:         save,
    load:         load,
    clear:        clear,
    exportFile:   exportFile,
    importFile:   importFile,
    deserialize:  deserialize,
    get scheduleSave() { return scheduleSave; },
  };
})();
