/**
 * Painless Pixels — Undo/Redo System
 *
 * Captures design-property snapshots on each markDirty() call.
 * Cmd+Z undoes, Cmd+Shift+Z redoes.
 */
(function () {
  'use strict';

  var MAX_DEPTH = 30;
  var DEBOUNCE_MS = 500;
  var _undoStack = [];
  var _redoStack = [];
  var _lastCaptureTime = 0;

  PP._applyingSnapshot = false;

  function snapshot() {
    var S = PP.State;
    var slide = S.slides[S.activeSlideIndex];
    var snap = {
      slideIndex: S.activeSlideIndex,
      settings:   PP.captureCurrentSettings(),
    };
    if (slide) {
      if (slide.imageData) snap.imageData = slide.imageData;
      if (slide.tabletImageData) snap.tabletImageData = slide.tabletImageData;
    }
    return snap;
  }

  PP.pushUndo = function () {
    if (PP._applyingSnapshot) return;
    var now = Date.now();
    if (now - _lastCaptureTime < DEBOUNCE_MS) return;
    _lastCaptureTime = now;
    _undoStack.push(snapshot());
    if (_undoStack.length > MAX_DEPTH) _undoStack.shift();
    _redoStack.length = 0;
  };

  PP.undo = function () {
    if (!_undoStack.length) return;
    if (PP.dismissDeleteToast) PP.dismissDeleteToast();
    _redoStack.push(snapshot());
    var prev = _undoStack.pop();
    _applySnapshot(prev);
  };

  PP.redo = function () {
    if (!_redoStack.length) return;
    if (PP.dismissDeleteToast) PP.dismissDeleteToast();
    _undoStack.push(snapshot());
    var next = _redoStack.pop();
    _applySnapshot(next);
  };

  function _applySnapshot(snap) {
    var S = PP.State;
    PP._applyingSnapshot = true;

    if (snap.slideIndex !== S.activeSlideIndex &&
        snap.slideIndex >= 0 &&
        snap.slideIndex < S.slides.length) {
      S.activeSlideIndex = snap.slideIndex;
    }

    var slide = S.slides[S.activeSlideIndex];
    if (slide) {
      Object.assign(slide, snap.settings);
      if (snap.imageData !== undefined) slide.imageData = snap.imageData;
      if (snap.tabletImageData !== undefined) slide.tabletImageData = snap.tabletImageData;
    }

    PP.loadSlideSettings(snap.settings);

    S._notifyAll([
      'headline', 'subheadline', 'headlineSize', 'subheadlineSize',
      'textColor', 'subheadlineColor',
      'phoneAngle', 'headlineAngle', 'subheadlineAngle',
      'bgType', 'bgFrom', 'bgTo', 'bgAngle', 'bgSolid',
      'bgSplitTop', 'bgSplitBottom',
      'templateId',
      'phoneXFrac', 'phoneYFrac',
      'headlineXFrac', 'headlineYFrac',
      'subheadlineXFrac', 'subheadlineYFrac',
    ]);

    PP.applyCurrentTemplate();
    PP.renderSlideList();
    PP.updateCanvasNav();  // explicit call since undo may not change activeSlideIndex
    PP.syncActiveSlide();
    Storage.scheduleSave(S);

    PP._applyingSnapshot = false;
  }

})();
