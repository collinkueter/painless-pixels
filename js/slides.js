/**
 * Painless Pixels — Slides Panel & Canvas Navigation
 *
 * Manages slide list rendering, reordering, deletion,
 * canvas navigation (prev/next), and active slide loading.
 */
(function () {
  'use strict';

  var S = PP.State;

  // No-ops so any stale call sites don't crash
  PP.renderCanvasStrip = function () {};
  PP.debouncedStripRender = function () {};

  // ── Canvas navigation (prev/next + label) ──────────────────────────

  PP.updateCanvasNav = function () {
    var label = Utils.$('#canvas-nav-label');
    var prevBtn = Utils.$('#prev-slide-btn');
    var nextBtn = Utils.$('#next-slide-btn');
    if (!label) return;

    var total = S.slides.length;
    var current = S.activeSlideIndex + 1;
    label.textContent = current + ' / ' + total;
    label.setAttribute('aria-label', 'Slide ' + current + ' of ' + total);

    if (prevBtn) prevBtn.disabled = S.activeSlideIndex <= 0;
    if (nextBtn) nextBtn.disabled = S.activeSlideIndex >= total - 1;
  };

  // ── Centralized slide switching ────────────────────────────────────

  PP.switchToSlide = function (newIndex) {
    if (newIndex < 0 || newIndex >= S.slides.length) return false;
    if (newIndex === S.activeSlideIndex) return false;

    S.activeSlideIndex = newIndex;
    PP.renderSlideList();
    PP.loadActiveSlide();
    PP.markDirty();
    return true;
  };

  // ── Slide list (right panel) ──────────────────────────────────────────

  PP.renderSlideList = function () {
    var list = Utils.$('#slides-list');
    list.innerHTML = '';
    var slides = S.slides;

    slides.forEach(function (slide, idx) {
      var item = document.createElement('div');
      item.className = 'slide-item' + (idx === S.activeSlideIndex ? ' active' : '');
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', idx === S.activeSlideIndex ? 'true' : 'false');
      item.setAttribute('aria-label', 'Slide ' + (idx + 1) + ': ' + slide.title);
      item.setAttribute('tabindex', idx === S.activeSlideIndex ? '0' : '-1');

      var img = document.createElement('img');
      img.src = PP.getSlideImage(slide);
      img.alt = slide.title;

      var num = document.createElement('div');
      num.className = 'slide-number';
      num.textContent = idx + 1;

      // Reorder buttons (up/down)
      var reorder = document.createElement('div');
      reorder.className = 'slide-reorder';
      var upBtn = document.createElement('button');
      upBtn.className = 'slide-reorder-btn';
      upBtn.setAttribute('aria-label', 'Move slide ' + (idx + 1) + ' up');
      upBtn.disabled = idx === 0;
      upBtn.innerHTML = '<svg width="8" height="8" viewBox="0 0 8 8" fill="none">' +
        '<path d="M4 6V2M4 2L2 4M4 2L6 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
      var downBtn = document.createElement('button');
      downBtn.className = 'slide-reorder-btn';
      downBtn.setAttribute('aria-label', 'Move slide ' + (idx + 1) + ' down');
      downBtn.disabled = idx === slides.length - 1;
      downBtn.innerHTML = '<svg width="8" height="8" viewBox="0 0 8 8" fill="none">' +
        '<path d="M4 2V6M4 6L2 4M4 6L6 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
      reorder.appendChild(upBtn);
      reorder.appendChild(downBtn);

      var del = document.createElement('button');
      del.className = 'slide-delete';
      del.setAttribute('aria-label', 'Remove slide ' + (idx + 1));
      del.innerHTML = '<svg width="8" height="8" viewBox="0 0 8 8" fill="none">' +
        '<path d="M1 1L7 7M7 1L1 7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>' +
      '</svg>';

      item.appendChild(img);
      item.appendChild(num);
      item.appendChild(reorder);
      item.appendChild(del);

      // Tablet override badge
      if (slide.tabletImageData) {
        var badge = document.createElement('button');
        badge.className = 'slide-tablet-badge';
        badge.textContent = 'T';
        badge.setAttribute('aria-label', 'Clear tablet override for slide ' + (idx + 1));
        badge.title = 'Has tablet screenshot \u2014 click to clear';
        badge.addEventListener('click', (function (slideRef, slideIdx) {
          return function (e) {
            e.stopPropagation();
            slideRef.tabletImageData = null;
            PP.renderSlideList();
            if (slideIdx === S.activeSlideIndex) PP.loadActiveSlide();
            PP.markDirty();
          };
        })(slide, idx));
        item.appendChild(badge);
      }

      list.appendChild(item);

      item.addEventListener('click', (function (slideIdx) {
        return function (e) {
          if (e.target.closest('.slide-delete') || e.target.closest('.slide-reorder') || e.target.closest('.slide-tablet-badge')) return;
          PP.switchToSlide(slideIdx);
        };
      })(idx));

      upBtn.addEventListener('click', (function (slideIdx) {
        return function (e) { e.stopPropagation(); reorderSlide(slideIdx, -1); };
      })(idx));
      downBtn.addEventListener('click', (function (slideIdx) {
        return function (e) { e.stopPropagation(); reorderSlide(slideIdx, +1); };
      })(idx));

      del.addEventListener('click', (function (slideIdx) {
        return function (e) {
          e.stopPropagation();
          deleteSlide(slideIdx);
        };
      })(idx));
    });

    PP.updateSlideAspectRatio();
  };

  function reorderSlide(idx, delta) {
    var slides = S.slides;
    var newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= slides.length) return;
    var tmp = slides[idx];
    slides[idx]    = slides[newIdx];
    slides[newIdx] = tmp;
    if (S.activeSlideIndex === idx) S.activeSlideIndex = newIdx;
    else if (S.activeSlideIndex === newIdx) S.activeSlideIndex = idx;
    PP.renderSlideList();
    PP.updateExportCounts();
    PP.markDirty();
  }

  var _deletedSlide = null;
  var _deleteToast = null;
  var _deleteTimer = null;

  function deleteSlide(idx) {
    // Save for undo
    _deletedSlide = { slide: S.slides[idx], index: idx };

    S.slides.splice(idx, 1);
    if (S.activeSlideIndex >= S.slides.length) {
      S.activeSlideIndex = Math.max(0, S.slides.length - 1);
    }
    PP.renderSlideList();
    if (S.slides.length) {
      PP.loadActiveSlide();
    }
    PP.updateExportCounts();
    PP.markDirty();

    showDeleteToast();
  }

  function showDeleteToast() {
    if (_deleteToast && _deleteToast.parentNode) _deleteToast.remove();
    if (_deleteTimer) clearTimeout(_deleteTimer);

    _deleteToast = document.createElement('div');
    _deleteToast.className = 'restore-banner';
    _deleteToast.setAttribute('role', 'status');
    _deleteToast.setAttribute('aria-live', 'polite');
    _deleteToast.setAttribute('aria-atomic', 'true');
    _deleteToast.innerHTML =
      '<span>Slide deleted</span>' +
      '<button class="restore-banner-btn" id="undo-delete-btn" aria-label="Undo slide deletion">Undo</button>' +
      '<button class="restore-banner-close" aria-label="Dismiss">' +
        '<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 2L8 8M8 2L2 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>' +
      '</button>';

    document.body.appendChild(_deleteToast);

    _deleteToast.querySelector('#undo-delete-btn').addEventListener('click', function () {
      if (_deletedSlide) {
        var i = Math.min(_deletedSlide.index, S.slides.length);
        S.slides.splice(i, 0, _deletedSlide.slide);
        S.activeSlideIndex = i;
        _deletedSlide = null;
        PP.renderSlideList();
        PP.loadActiveSlide();
        PP.updateExportCounts();
        PP.markDirty();
      }
      dismissDeleteToast();
    });

    _deleteToast.querySelector('.restore-banner-close').addEventListener('click', dismissDeleteToast);

    _deleteTimer = setTimeout(function () {
      if (_deleteToast && _deleteToast.parentNode) {
        dismissDeleteToast();
      }
    }, 5000);
  }

  function dismissDeleteToast() {
    if (_deleteTimer) { clearTimeout(_deleteTimer); _deleteTimer = null; }
    if (_deleteToast && _deleteToast.parentNode) _deleteToast.remove();
    _deleteToast = null;
    _deletedSlide = null;
  }

  // Expose for undo system to dismiss toast on Cmd+Z
  PP.dismissDeleteToast = dismissDeleteToast;

  PP.loadActiveSlide = function () {
    var slide = S.slides[S.activeSlideIndex];
    if (!slide) return;

    var wrapper = Utils.$('#canvas-wrapper');
    if (wrapper) wrapper.classList.add('canvas-transitioning');

    PP.loadSlideSettings(slide);
    Editor.loadSlide(slide, PP.getSlideImage(slide));
    PP.applyCurrentTemplate();

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (wrapper) wrapper.classList.remove('canvas-transitioning');
      });
    });
  };

  // ── Slide panel wiring ────────────────────────────────────────────────

  PP.wireSlidePanel = function () {
    // "Add slide" button in slides panel header
    Utils.$('#add-slide-btn').addEventListener('click', function () {
      Utils.$('#add-file-input').click();
    });

    Utils.$('#add-file-input').addEventListener('change', async function (e) {
      var newSlides = await Upload.filesToSlides(e.target.files);
      e.target.value = '';
      if (!newSlides.length) return;
      var isTablet = Devices.isTablet(S.activeDevice);
      var settings = PP.captureCurrentSettings();
      newSlides.forEach(function (s) {
        Object.assign(s, settings);
        s.tabletImageData = isTablet ? s.imageData : null;
      });
      var maxNew = 10 - S.slides.length;
      S.slides.push.apply(S.slides, newSlides.slice(0, maxNew));
      PP.renderSlideList();
      PP.updateExportCounts();
      PP.markDirty();
    });

    // "Add screenshots" button in header
    Utils.$('#add-screenshots-btn').addEventListener('click', function () {
      Utils.$('#add-file-input').click();
    });

    // Prev/Next buttons below canvas
    var prevBtn = Utils.$('#prev-slide-btn');
    var nextBtn = Utils.$('#next-slide-btn');

    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        PP.switchToSlide(S.activeSlideIndex - 1);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        PP.switchToSlide(S.activeSlideIndex + 1);
      });
    }

    // Reactive: update nav whenever activeSlideIndex changes
    S._subscribe('activeSlideIndex', function () {
      PP.updateCanvasNav();
    });
  };

})();
