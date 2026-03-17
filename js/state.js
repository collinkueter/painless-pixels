/**
 * Painless Pixels — Reactive State Layer
 *
 * Provides the PP namespace, DEFAULTS, and a Proxy-based reactive State object.
 * Modules subscribe to State property changes; manual sync functions are eliminated.
 */
var PP = {};

(function () {
  'use strict';

  // ── Defaults (single source of truth) ─────────────────────────────────

  PP.DEFAULTS = {
    activeDevice:  'iphone',
    orientation:   'portrait',
    templateId:    'bold-dark',
    bgType:        'gradient',
    bgFrom:        '#0d0d0d',
    bgTo:          '#18103a',
    bgAngle:       145,
    bgSolid:       '#6366f1',
    bgSplitTop:    '#5b5fcf',
    bgSplitBottom: '#f5f5f5',
    headline:      'Your App Headline',
    subheadline:   'The perfect description',
    headlineSize:       38,
    subheadlineSize:    20,
    textColor:          '#ffffff',
    subheadlineColor:   '#aaaaaa',
  };

  // ── Reactive proxy factory ────────────────────────────────────────────

  function createReactiveState(initial) {
    var _subs = {};       // key → [callback, ...]
    var _batchDepth = 0;
    var _batchChanged = {};

    var target = Object.assign({}, initial);

    var proxy = new Proxy(target, {
      set: function (obj, key, value) {
        // Private/meta keys pass through silently
        if (typeof key === 'string' && key.charAt(0) === '_') {
          obj[key] = value;
          return true;
        }
        var old = obj[key];
        obj[key] = value;
        if (old !== value) {
          if (_batchDepth > 0) {
            _batchChanged[key] = true;
          } else {
            _notify(key, value);
          }
        }
        return true;
      }
    });

    function _notify(key, value) {
      var list = _subs[key];
      if (!list) return;
      for (var i = 0; i < list.length; i++) {
        list[i](value);
      }
    }

    /** Subscribe to changes on a single property */
    proxy._subscribe = function (key, fn) {
      if (!_subs[key]) _subs[key] = [];
      _subs[key].push(fn);
    };

    /** Subscribe to changes on multiple properties with one callback */
    proxy._subscribeMany = function (keys, fn) {
      for (var i = 0; i < keys.length; i++) {
        if (!_subs[keys[i]]) _subs[keys[i]] = [];
        _subs[keys[i]].push(fn);
      }
    };

    /** Force-notify all subscribers for the given keys (used for initial sync) */
    proxy._notifyAll = function (keys) {
      for (var i = 0; i < keys.length; i++) {
        _notify(keys[i], target[keys[i]]);
      }
    };

    /** Batch multiple assignments — subscribers fire once per changed key at the end */
    proxy._batch = function (fn) {
      _batchDepth++;
      try {
        fn();
      } finally {
        _batchDepth--;
        if (_batchDepth === 0) {
          var keys = Object.keys(_batchChanged);
          _batchChanged = {};
          for (var i = 0; i < keys.length; i++) {
            _notify(keys[i], target[keys[i]]);
          }
        }
      }
    };

    return proxy;
  }

  // ── State instance ────────────────────────────────────────────────────

  PP.State = createReactiveState(Object.assign({
    slides:           [],
    activeSlideIndex: 0,
    phoneXFrac:       null,
    phoneYFrac:       null,
    phoneAngle:       0,
    headlineXFrac:    null,
    headlineYFrac:    null,
    headlineAngle:    0,
    subheadlineXFrac: null,
    subheadlineYFrac: null,
    subheadlineAngle: 0,
  }, PP.DEFAULTS));

  // ── Shared helpers ────────────────────────────────────────────────────

  /** Get the image URL for a slide based on the active device form factor */
  PP.getSlideImage = function (slide) {
    if (Devices.isTablet(PP.State.activeDevice) && slide.tabletImageData) {
      return slide.tabletImageData;
    }
    return slide.imageData;
  };

  /** Write current State design settings back into the active slide */
  PP.syncActiveSlide = function () {
    var slide = PP.State.slides[PP.State.activeSlideIndex];
    if (!slide) return;
    Object.assign(slide, PP.captureCurrentSettings());
  };

  /** Snapshot the current State design settings as a plain object */
  PP.captureCurrentSettings = function () {
    var S = PP.State;
    return {
      templateId:       S.templateId,
      bgType:           S.bgType,
      bgFrom:           S.bgFrom,
      bgTo:             S.bgTo,
      bgAngle:          S.bgAngle,
      bgSolid:          S.bgSolid,
      bgSplitTop:       S.bgSplitTop,
      bgSplitBottom:    S.bgSplitBottom,
      headline:         S.headline,
      subheadline:      S.subheadline,
      headlineSize:     S.headlineSize,
      subheadlineSize:  S.subheadlineSize,
      textColor:        S.textColor,
      subheadlineColor: S.subheadlineColor,
      phoneXFrac:       S.phoneXFrac,
      phoneYFrac:       S.phoneYFrac,
      phoneAngle:       S.phoneAngle,
      headlineXFrac:    S.headlineXFrac,
      headlineYFrac:    S.headlineYFrac,
      headlineAngle:    S.headlineAngle,
      subheadlineXFrac: S.subheadlineXFrac,
      subheadlineYFrac: S.subheadlineYFrac,
      subheadlineAngle: S.subheadlineAngle,
      orientation:      S.orientation,
    };
  };

  /** Load a slide's design settings into State (with DEFAULTS fallback) */
  PP.loadSlideSettings = function (slide) {
    var D = PP.DEFAULTS;
    var S = PP.State;
    S._batch(function () {
      S.templateId       = slide.templateId       ?? D.templateId;
      S.bgType           = slide.bgType           ?? D.bgType;
      S.bgFrom           = slide.bgFrom           ?? D.bgFrom;
      S.bgTo             = slide.bgTo             ?? D.bgTo;
      S.bgAngle          = slide.bgAngle          ?? D.bgAngle;
      S.bgSolid          = slide.bgSolid          ?? D.bgSolid;
      S.bgSplitTop       = slide.bgSplitTop       ?? D.bgSplitTop;
      S.bgSplitBottom    = slide.bgSplitBottom    ?? D.bgSplitBottom;
      S.headline         = slide.headline         ?? D.headline;
      S.subheadline      = slide.subheadline      ?? D.subheadline;
      S.headlineSize     = slide.headlineSize     ?? D.headlineSize;
      S.subheadlineSize  = slide.subheadlineSize  ?? D.subheadlineSize;
      S.textColor        = slide.textColor        ?? D.textColor;
      S.subheadlineColor = slide.subheadlineColor ?? D.subheadlineColor;
      S.phoneXFrac       = typeof slide.phoneXFrac === 'number' ? slide.phoneXFrac : null;
      S.phoneYFrac       = typeof slide.phoneYFrac === 'number' ? slide.phoneYFrac : null;
      S.phoneAngle       = slide.phoneAngle       ?? 0;
      S.headlineXFrac    = typeof slide.headlineXFrac === 'number' ? slide.headlineXFrac : null;
      S.headlineYFrac    = typeof slide.headlineYFrac === 'number' ? slide.headlineYFrac : null;
      S.headlineAngle    = slide.headlineAngle    ?? 0;
      S.subheadlineXFrac = typeof slide.subheadlineXFrac === 'number' ? slide.subheadlineXFrac : null;
      S.subheadlineYFrac = typeof slide.subheadlineYFrac === 'number' ? slide.subheadlineYFrac : null;
      S.subheadlineAngle = slide.subheadlineAngle ?? 0;
      S.orientation      = slide.orientation      ?? D.orientation;
    });
  };

  /** Save current slide then schedule auto-save */
  PP.markDirty = function () {
    if (PP.pushUndo && !PP._applyingSnapshot) PP.pushUndo();
    PP.syncActiveSlide();
    Storage.scheduleSave(PP.State);
  };

  // Placeholder — set by app.js once it loads
  PP.applyCurrentTemplate = null;

})();
