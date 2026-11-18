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
  var SCHEMA_VERSION = 5;

  var ALLOWED_IMAGE_TYPES = ['data:image/png', 'data:image/jpeg', 'data:image/webp', 'data:image/gif'];
  var MAX_SLIDE_DATA_LENGTH = 20 * 1024 * 1024; // 20MB per slide
  var MAX_BUCKET_ENTRY_SIZE = 20 * 1024 * 1024; // 20MB per bucket entry

  var BUCKET_DEVICES = ['iphone', 'ipad', 'android-phone', 'android-7', 'android-10'];

  function _emptyBuckets() {
    return { iphone: [], ipad: [], 'android-phone': [], 'android-7': [], 'android-10': [] };
  }

  function _uid() {
    return Math.random().toString(36).slice(2, 9);
  }

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

  // ── Slide serialization helper ──────────────────────────────────────

  function _serializeSlide(s) {
    return {
      id:               s.id,
      imageData:        s.imageData || null,
      tabletImageData:  s.tabletImageData || null,
      deviceImages:     s.deviceImages || null,
      title:            s.title || 'Untitled',
      templateId:       s.templateId,
      bgType:           s.bgType,
      bgFrom:           s.bgFrom,
      bgTo:             s.bgTo,
      bgAngle:          s.bgAngle,
      bgSolid:          s.bgSolid,
      bgSplitTop:       s.bgSplitTop,
      bgSplitBottom:    s.bgSplitBottom,
      headline:         s.headline,
      subheadline:      s.subheadline,
      headlineSize:     s.headlineSize,
      subheadlineSize:  s.subheadlineSize,
      textColor:        s.textColor,
      subheadlineColor: s.subheadlineColor,
      phoneXFrac:       s.phoneXFrac,
      phoneYFrac:       s.phoneYFrac,
      phoneAngle:       s.phoneAngle,
      headlineXFrac:    s.headlineXFrac,
      headlineYFrac:    s.headlineYFrac,
      headlineAngle:    s.headlineAngle,
      subheadlineXFrac: s.subheadlineXFrac,
      subheadlineYFrac: s.subheadlineYFrac,
      subheadlineAngle: s.subheadlineAngle,
      orientation:      s.orientation || 'portrait',
    };
  }

  function _isValidBucketEntry(e) {
    if (!e || typeof e.id !== 'string' || !e.id) return false;
    if (typeof e.imageData !== 'string') return false;
    if (e.imageData.length > MAX_BUCKET_ENTRY_SIZE) return false;
    for (var i = 0; i < ALLOWED_IMAGE_TYPES.length; i++) {
      if (e.imageData.startsWith(ALLOWED_IMAGE_TYPES[i])) return true;
    }
    return false;
  }

  function _serializeBuckets(buckets) {
    if (!buckets) return _emptyBuckets();
    var result = {};
    BUCKET_DEVICES.forEach(function (dev) {
      var entries = Array.isArray(buckets[dev]) ? buckets[dev] : [];
      result[dev] = entries.filter(_isValidBucketEntry).map(function (e) {
        return { id: e.id, imageData: e.imageData, title: (e.title || '').slice(0, 256) };
      });
    });
    return result;
  }

  function _deserializeBuckets(data) {
    if (!data || typeof data !== 'object') return _emptyBuckets();
    var result = {};
    BUCKET_DEVICES.forEach(function (dev) {
      var entries = Array.isArray(data[dev]) ? data[dev] : [];
      result[dev] = entries.filter(_isValidBucketEntry).map(function (e) {
        return { id: e.id, imageData: e.imageData, title: (e.title || '').slice(0, 256) };
      });
    });
    return result;
  }

  // ── Serialization ─────────────────────────────────────────────────────

  function serialize(state) {
    var slides = (state.slides || []).filter(function (s) {
      return s && _isValidSlide(s);
    }).map(_serializeSlide);

    return {
      _schemaVersion: SCHEMA_VERSION,
      _savedAt: new Date().toISOString(),
      slides:           slides,
      buckets: _serializeBuckets(state.buckets),
      activeSlideIndex: state.activeSlideIndex,
      activeDevice:     state.activeDevice,
      orientation:      state.orientation || 'portrait',
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
    if (!s || typeof s.id !== 'string' || !s.id) return false;
    // If imageData is present, validate it
    if (s.imageData) {
      if (s.imageData.length > MAX_SLIDE_DATA_LENGTH) return false;
      for (var i = 0; i < ALLOWED_IMAGE_TYPES.length; i++) {
        if (s.imageData.startsWith(ALLOWED_IMAGE_TYPES[i])) return true;
      }
      return false;
    }
    // Slides without imageData are valid (image assigned from bucket)
    return true;
  }

  /**
   * Migrate V2 data (flat slides array + device) to V4 (flat slides + activeDevice + tabletImageData).
   */
  function _migrateV2toV4(data) {
    var slides = Array.isArray(data.slides) ? data.slides : [];
    slides.forEach(function (s) { s.tabletImageData = null; });
    data.slides = slides;
    data.activeDevice = data.device || 'iphone';
    if (data.activeDevice === 'android') data.activeDevice = 'android-phone';
    data._schemaVersion = 4;
    delete data.device;
    return data;
  }

  /**
   * Migrate V3 data (deviceSlides keyed by device) to V4 (flat slides + tabletImageData).
   */
  function _migrateV3toV4(data) {
    var deviceSlides = data.deviceSlides || {};
    // Find first non-empty phone device slides as primary
    var phoneDevices = Devices.FORM_DEVICES.phone;
    var tabletDevices = Devices.FORM_DEVICES.tablet;
    var primarySlides = [];
    var primaryDevice = 'iphone';

    for (var i = 0; i < phoneDevices.length; i++) {
      var dev = phoneDevices[i];
      if (deviceSlides[dev] && deviceSlides[dev].length) {
        primarySlides = deviceSlides[dev].slice();
        primaryDevice = dev;
        break;
      }
    }

    // If no phone slides found, try tablet slides
    if (!primarySlides.length) {
      for (var j = 0; j < tabletDevices.length; j++) {
        var tDev = tabletDevices[j];
        if (deviceSlides[tDev] && deviceSlides[tDev].length) {
          primarySlides = deviceSlides[tDev].slice();
          primaryDevice = tDev;
          break;
        }
      }
    }

    // For each primary slide, pull tabletImageData from matching tablet device slide by index
    var tabletSlides = null;
    for (var k = 0; k < tabletDevices.length; k++) {
      if (deviceSlides[tabletDevices[k]] && deviceSlides[tabletDevices[k]].length) {
        tabletSlides = deviceSlides[tabletDevices[k]];
        break;
      }
    }

    primarySlides.forEach(function (s, idx) {
      if (tabletSlides && tabletSlides[idx] && tabletSlides[idx].imageData) {
        s.tabletImageData = tabletSlides[idx].imageData;
      } else {
        s.tabletImageData = null;
      }
    });

    data.slides = primarySlides;
    data.activeDevice = data.activeDevice || primaryDevice;
    data._schemaVersion = 4;
    delete data.deviceSlides;
    return data;
  }

  /**
   * Migrate V4 data (flat slides + tabletImageData) to V5 (buckets + deviceImages).
   * Moves slide.imageData → iphone bucket, slide.tabletImageData → ipad bucket.
   */
  function _migrateV4toV5(data) {
    var buckets = _emptyBuckets();
    var slides = Array.isArray(data.slides) ? data.slides : [];

    slides.forEach(function (s) {
      var deviceImages = { iphone: null, ipad: null, 'android-phone': null, 'android-7': null, 'android-10': null };

      // Migrate imageData → iphone bucket
      if (s.imageData && typeof s.imageData === 'string') {
        var phoneEntry = { id: _uid(), imageData: s.imageData, title: s.title || 'Screenshot' };
        buckets.iphone.push(phoneEntry);
        deviceImages.iphone = phoneEntry.id;
      }
      // Migrate tabletImageData → ipad bucket
      if (s.tabletImageData && typeof s.tabletImageData === 'string') {
        var tabletEntry = { id: _uid(), imageData: s.tabletImageData, title: s.title || 'Screenshot' };
        buckets.ipad.push(tabletEntry);
        deviceImages.ipad = tabletEntry.id;
      }

      s.deviceImages = deviceImages;
    });

    data.buckets = buckets;
    data._schemaVersion = 5;
    return data;
  }

  function _deserializeSlide(s, data, defaults) {
    return {
      id:               s.id || Utils.uid(),
      file:             null,
      imageData:        s.imageData,
      tabletImageData:  s.tabletImageData || null,
      deviceImages:     s.deviceImages || { iphone: null, ipad: null, 'android-phone': null, 'android-7': null, 'android-10': null },
      title:            s.title || 'Untitled',
      templateId:       s.templateId || data.templateId || defaults.templateId,
      bgType:           s.bgType || data.bgType || defaults.bgType,
      bgFrom:           s.bgFrom || data.bgFrom || defaults.bgFrom,
      bgTo:             s.bgTo || data.bgTo || defaults.bgTo,
      bgAngle:          typeof s.bgAngle === 'number' ? s.bgAngle : (typeof data.bgAngle === 'number' ? data.bgAngle : defaults.bgAngle),
      bgSolid:          s.bgSolid || data.bgSolid || defaults.bgSolid,
      bgSplitTop:       s.bgSplitTop || data.bgSplitTop || defaults.bgSplitTop,
      bgSplitBottom:    s.bgSplitBottom || data.bgSplitBottom || defaults.bgSplitBottom,
      headline:         typeof s.headline === 'string' ? s.headline : (typeof data.headline === 'string' ? data.headline : defaults.headline),
      subheadline:      typeof s.subheadline === 'string' ? s.subheadline : (typeof data.subheadline === 'string' ? data.subheadline : defaults.subheadline),
      headlineSize:     typeof s.headlineSize === 'number' ? s.headlineSize : (typeof data.headlineSize === 'number' ? data.headlineSize : defaults.headlineSize),
      subheadlineSize:  typeof s.subheadlineSize === 'number' ? s.subheadlineSize : (typeof data.subheadlineSize === 'number' ? data.subheadlineSize : defaults.subheadlineSize),
      textColor:        s.textColor || data.textColor || defaults.textColor,
      subheadlineColor: s.subheadlineColor || data.subheadlineColor || defaults.subheadlineColor,
      phoneXFrac:       typeof s.phoneXFrac === 'number' ? s.phoneXFrac : null,
      phoneYFrac:       typeof s.phoneYFrac === 'number' ? s.phoneYFrac : null,
      phoneAngle:       typeof s.phoneAngle === 'number' ? s.phoneAngle : 0,
      headlineXFrac:    typeof s.headlineXFrac === 'number' ? s.headlineXFrac : null,
      headlineYFrac:    typeof s.headlineYFrac === 'number' ? s.headlineYFrac : null,
      headlineAngle:    typeof s.headlineAngle === 'number' ? s.headlineAngle : 0,
      subheadlineXFrac: typeof s.subheadlineXFrac === 'number' ? s.subheadlineXFrac : null,
      subheadlineYFrac: typeof s.subheadlineYFrac === 'number' ? s.subheadlineYFrac : null,
      subheadlineAngle: typeof s.subheadlineAngle === 'number' ? s.subheadlineAngle : 0,
      orientation:      s.orientation || data.orientation || 'portrait',
    };
  }

  function deserialize(data, defaults) {
    if (!data || typeof data !== 'object') return null;

    // Reject newer schema versions
    if (data._schemaVersion && data._schemaVersion > SCHEMA_VERSION) return null;

    // V2 → V4 migration (flat slides + device)
    if (!data._schemaVersion || data._schemaVersion < 3) {
      data = _migrateV2toV4(data);
    }
    // V3 → V4 migration (deviceSlides)
    else if (data._schemaVersion === 3) {
      data = _migrateV3toV4(data);
    }
    // V4 → V5 migration (buckets + deviceImages)
    if (data._schemaVersion === 4) {
      data = _migrateV4toV5(data);
    }

    // Build slides from saved data
    var rawSlides = Array.isArray(data.slides) ? data.slides.filter(_isValidSlide) : [];
    var slides = rawSlides.map(function (s) {
      return _deserializeSlide(s, data, defaults);
    });

    var buckets = _deserializeBuckets(data.buckets);

    // Accept if we have slides OR bucket images
    var hasBucketContent = BUCKET_DEVICES.some(function (dev) {
      return buckets[dev] && buckets[dev].length > 0;
    });
    if (!slides.length && !hasBucketContent) return null;

    return {
      _savedAt:         data._savedAt || null,
      slides:           slides,
      buckets:          buckets,
      activeSlideIndex: Math.min(
        Math.max(0, typeof data.activeSlideIndex === 'number' ? data.activeSlideIndex : 0),
        Math.max(0, slides.length - 1)
      ),
      activeDevice:     data.activeDevice || defaults.activeDevice || 'iphone',
      orientation:      data.orientation || 'portrait',
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

  function _hasAnyContent(state) {
    if (state.slides && state.slides.length > 0) return true;
    if (state.buckets) {
      for (var i = 0; i < BUCKET_DEVICES.length; i++) {
        var dev = BUCKET_DEVICES[i];
        if (state.buckets[dev] && state.buckets[dev].length > 0) return true;
      }
    }
    return false;
  }

  function save(state) {
    if (!_idbAvailable) return Promise.resolve();
    var version = ++_saveVersion;
    var data = serialize(state);
    if (!_hasAnyContent(state)) return Promise.resolve(); // don't save empty/invalid state
    return _put(SESSION_KEY, data).then(function () {
      if (version === _saveVersion && _onSave) {
        _onSave();
      }
    }).catch(function (err) {
      if (err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
        if (_onError) _onError('idb-quota-exceeded', err);
      } else {
        if (_onError) _onError('save-failed', err);
      }
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
      var objectURL = URL.createObjectURL(blob);
      a.href = objectURL;
      a.download = filename || 'design.pp';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(objectURL); }, 100);
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
          } else if (parsed.slides || parsed.deviceSlides) {
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
