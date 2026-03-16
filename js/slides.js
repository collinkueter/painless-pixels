/**
 * Painless Pixels — Slides Panel & Canvas Strip
 *
 * Manages slide list rendering, reordering, deletion,
 * canvas strip with live previews, and active slide loading.
 */
(function () {
  'use strict';

  var S = PP.State;

  // Object URLs for rendered non-active slide previews — revoked on rebuild
  var _previewURLs = {};

  // ── Canvas strip (all slides side-by-side) ───────────────────────────

  PP.renderCanvasStrip = function () {
    var container = Utils.$('#canvas-container');
    var wrapper   = Utils.$('#canvas-wrapper');
    var slides    = S.slides;
    var preview   = Devices.PREVIEW[S.activeDevice];

    // Detach canvas-wrapper before clearing innerHTML so Fabric.js survives
    wrapper.remove();

    // Revoke stale preview object URLs
    Object.values(_previewURLs).forEach(function (u) { URL.revokeObjectURL(u); });
    _previewURLs = {};

    container.innerHTML = '';

    slides.forEach(function (slide, i) {
      var isActive = (i === S.activeSlideIndex);

      var slot = document.createElement('div');
      slot.className = 'canvas-slot' + (isActive ? ' canvas-slot-active' : '');
      slot.dataset.index = i;

      if (isActive) {
        slot.appendChild(wrapper);
      } else {
        var img = document.createElement('img');
        img.className = 'canvas-slide-preview';
        img.width  = preview.w;
        img.height = preview.h;
        img.alt    = 'Slide ' + (i + 1);
        img.dataset.slideIndex = i;
        // Show raw screenshot as placeholder until the styled render is ready
        img.src = PP.getSlideImage(slide);
        slot.appendChild(img);

        slot.addEventListener('click', (function (idx) {
          return function () {
            S.activeSlideIndex = idx;
            Utils.$$('.slide-item').forEach(function (el, j) {
              el.classList.toggle('active', j === idx);
              el.setAttribute('aria-selected', j === idx ? 'true' : 'false');
              el.setAttribute('tabindex', j === idx ? '0' : '-1');
            });
            PP.loadActiveSlide();
            PP.renderCanvasStrip();
            PP.markDirty();
          };
        })(i));
      }

      var label = document.createElement('div');
      label.className = 'canvas-slot-label';
      label.textContent = i + 1;
      slot.appendChild(label);

      container.appendChild(slot);
    });

    PP.debouncedStripRender();
  };

  PP.debouncedStripRender = Utils.debounce(renderNonActiveSlides, 600);

  async function renderNonActiveSlides() {
    var slides = S.slides;
    if (!slides.length) return;

    var device  = S.activeDevice;
    var preview = Devices.PREVIEW[device];
    var spec    = { w: preview.w, h: preview.h };
    var isTablet = Devices.isTablet(device);

    try {
      await document.fonts.load('bold 40px Syne');
      await document.fonts.load('normal 40px Syne');
    } catch (_) {}

    var frameImg = await Exporter._loadFrame(Devices.FRAME_PATH[device]).catch(function () { return null; });

    for (var i = 0; i < slides.length; i++) {
      if (i === S.activeSlideIndex) continue;

      var imgEl = Utils.$('[data-slide-index="' + i + '"]');
      if (!imgEl || !imgEl.isConnected) continue;

      var slide = slides[i];
      var tmpl  = Templates.getById(slide.templateId);
      var bgState = {
        bgType: slide.bgType, bgFrom: slide.bgFrom, bgTo: slide.bgTo,
        bgAngle: slide.bgAngle, bgSolid: slide.bgSolid,
        bgSplitTop: slide.bgSplitTop, bgSplitBottom: slide.bgSplitBottom,
      };
      var textState = {
        headline: slide.headline, subheadline: slide.subheadline,
        hlFontSize: slide.headlineSize, hlColor: slide.textColor,
        slFontSize: slide.subheadlineSize, slColor: slide.subheadlineColor,
      };
      var layoutState = {
        phoneXFrac: slide.phoneXFrac, phoneYFrac: slide.phoneYFrac, phoneAngle: slide.phoneAngle,
        headlineXFrac: slide.headlineXFrac, headlineYFrac: slide.headlineYFrac, headlineAngle: slide.headlineAngle,
        subheadlineXFrac: slide.subheadlineXFrac, subheadlineYFrac: slide.subheadlineYFrac, subheadlineAngle: slide.subheadlineAngle,
      };

      var imgSrc = (isTablet && slide.tabletImageData) ? slide.tabletImageData : slide.imageData;
      var screenshotImg = await Exporter._loadImage(imgSrc).catch(function () { return null; });
      var blob = await Exporter._renderSlide({
        spec: spec, device: device, tmpl: tmpl, bgState: bgState,
        textState: textState, layoutState: layoutState, screenshotImg: screenshotImg, frameImg: frameImg,
      });

      if (!imgEl.isConnected || imgEl.dataset.slideIndex != i) continue;

      if (_previewURLs[i]) URL.revokeObjectURL(_previewURLs[i]);
      var url = URL.createObjectURL(blob);
      _previewURLs[i] = url;
      imgEl.src = url;
    }
  }

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
            PP.renderCanvasStrip();
            PP.markDirty();
          };
        })(slide, idx));
        item.appendChild(badge);
      }

      list.appendChild(item);

      item.addEventListener('click', (function (slideIdx) {
        return function (e) {
          if (e.target.closest('.slide-delete') || e.target.closest('.slide-reorder') || e.target.closest('.slide-tablet-badge')) return;
          S.activeSlideIndex = slideIdx;
          Utils.$$('.slide-item').forEach(function (el, i) {
            el.classList.toggle('active', i === slideIdx);
            el.setAttribute('aria-selected', i === slideIdx ? 'true' : 'false');
            el.setAttribute('tabindex', i === slideIdx ? '0' : '-1');
          });
          PP.loadActiveSlide();
          PP.renderCanvasStrip();
          PP.markDirty();
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
    PP.renderCanvasStrip();
    PP.updateExportCounts();
    PP.markDirty();
  }

  function deleteSlide(idx) {
    S.slides.splice(idx, 1);
    if (S.activeSlideIndex >= S.slides.length) {
      S.activeSlideIndex = Math.max(0, S.slides.length - 1);
    }
    PP.renderSlideList();
    if (S.slides.length) {
      PP.loadActiveSlide();
    }
    PP.renderCanvasStrip();
    PP.updateExportCounts();
    PP.markDirty();
  }

  PP.loadActiveSlide = function () {
    var slide = S.slides[S.activeSlideIndex];
    if (!slide) return;
    PP.loadSlideSettings(slide);
    Editor.loadSlide(slide, PP.getSlideImage(slide));
    PP.applyCurrentTemplate();
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
      PP.renderCanvasStrip();
      PP.updateExportCounts();
      PP.markDirty();
    });

    // "Add screenshots" button in header
    Utils.$('#add-screenshots-btn').addEventListener('click', function () {
      Utils.$('#add-file-input').click();
    });
  };

})();
