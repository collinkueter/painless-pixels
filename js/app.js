/**
 * Painless Pixels — App Orchestrator
 *
 * Boot, restore, upload step, editor init, template selection,
 * file ops, export overlay, copy-to-clipboard, keyboard shortcuts.
 *
 * State + controls live in separate modules (state.js, controls-*.js, slides.js).
 */
(function () {
  'use strict';

  var S = PP.State;
  var D = PP.DEFAULTS;

  // ── Save status indicator ──────────────────────────────────────────────

  var _saveFlashTimer = null;

  function flashSaveStatus() {
    var el = Utils.$('#save-status');
    if (!el) return;
    if (_saveFlashTimer) clearTimeout(_saveFlashTimer);
    el.textContent = '';
    requestAnimationFrame(function () {
      el.textContent = 'Auto-saved';
      el.classList.add('visible');
      _saveFlashTimer = setTimeout(function () {
        el.classList.remove('visible');
        _saveFlashTimer = null;
      }, 2000);
    });
  }

  function showSaveError() {
    var el = Utils.$('#save-status');
    if (!el) return;
    if (_saveFlashTimer) clearTimeout(_saveFlashTimer);
    el.textContent = 'Save failed';
    el.classList.add('visible', 'error');
  }

  // ── Boot ────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', async function () {
    Theme.init();
    Storage.init({
      onSave: flashSaveStatus,
      onError: function (type) {
        if (type === 'idb-unavailable') {
          showSaveError();
          var el = Utils.$('#save-status');
          if (el) {
            el.textContent = 'Auto-save unavailable';
            el.classList.add('visible', 'error');
          }
        } else if (type === 'save-failed') {
          showSaveError();
        }
      },
    });
    initEditor();
    initExportOverlay();
    wireFileOperations();

    var saved = null;
    try {
      var raw = await Storage.load();
      if (raw) saved = Storage.deserialize(raw, D);
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('[PP] Failed to load session:', e);
    }

    if (saved && saved.slides && saved.slides.length) {
      Utils.$('#step-upload').classList.remove('active');
      restoreState(saved);
      triggerInitialSync();
      transitionToEditor();

      if (saved._savedAt) {
        var age = Date.now() - new Date(saved._savedAt).getTime();
        if (age > 5 * 60 * 1000) {
          showRestoreBanner(saved._savedAt);
        }
      }
    } else {
      initUploadStep();
    }
  });

  // ── Session restore banner ────────────────────────────────────────────

  function showRestoreBanner(savedAt) {
    var banner = document.createElement('div');
    banner.className = 'restore-banner';
    banner.setAttribute('role', 'status');

    var age = Date.now() - new Date(savedAt).getTime();
    var label;
    if (age < 60 * 60 * 1000) label = Math.round(age / 60000) + ' min ago';
    else if (age < 24 * 60 * 60 * 1000) label = Math.round(age / 3600000) + 'h ago';
    else label = Math.round(age / 86400000) + 'd ago';

    banner.innerHTML =
      '<span>Session restored from ' + label + '</span>' +
      '<button class="restore-banner-btn" id="restore-fresh-btn">Start fresh</button>' +
      '<button class="restore-banner-close" aria-label="Dismiss">' +
        '<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 2L8 8M8 2L2 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>' +
      '</button>';

    document.body.appendChild(banner);

    Utils.$('#restore-fresh-btn').addEventListener('click', clearSession);
    banner.querySelector('.restore-banner-close').addEventListener('click', function () {
      banner.remove();
    });

    setTimeout(function () {
      if (banner.parentNode) banner.remove();
    }, 8000);
  }

  // ── Restore from saved data ───────────────────────────────────────────

  function restoreState(data) {
    S.slides           = data.slides;
    S.activeDevice     = data.activeDevice || 'iphone';
    S.activeSlideIndex = Math.min(data.activeSlideIndex || 0, Math.max(0, S.slides.length - 1));
    var active = S.slides[S.activeSlideIndex];
    if (active) PP.loadSlideSettings(active);
  }

  /**
   * Trigger initial sync of all controls by force-notifying subscribers.
   * The reactive subscriptions handle DOM updates automatically.
   */
  function triggerInitialSync() {
    S._notifyAll([
      // Text
      'headline', 'subheadline', 'headlineSize', 'subheadlineSize',
      'textColor', 'subheadlineColor',
      // Layout
      'phoneAngle', 'headlineAngle', 'subheadlineAngle',
      // Background
      'bgType', 'bgFrom', 'bgTo', 'bgAngle', 'bgSolid',
      // Device
      'activeDevice',
    ]);

    Editor.switchDevice(S.activeDevice);

    // Template picker
    Templates.renderGrid(
      Utils.$('#template-grid'),
      S.templateId,
      onTemplateSelect
    );
  }

  // ── File operations ───────────────────────────────────────────────────

  function wireFileOperations() {
    var saveBtn    = Utils.$('#save-design-btn');
    var openBtn    = Utils.$('#load-design-btn');
    var newBtn     = Utils.$('#new-design-btn');
    var fileIn     = Utils.$('#load-file-input');
    var uploadOpen = Utils.$('#upload-open-btn');

    if (saveBtn) saveBtn.addEventListener('click', saveDesignToFile);
    if (openBtn) openBtn.addEventListener('click', function () { if (fileIn) fileIn.click(); });
    if (newBtn)  newBtn.addEventListener('click', showNewDesignConfirm);
    if (uploadOpen) uploadOpen.addEventListener('click', function () { if (fileIn) fileIn.click(); });

    if (fileIn) {
      fileIn.addEventListener('change', async function (e) {
        var file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        try {
          var raw = await Storage.importFile(file);
          var data = Storage.deserialize(raw, D);
          if (!data || !data.slides || !data.slides.length) {
            alert('Could not load design \u2014 no valid slides found.');
            return;
          }
          restoreState(data);
          triggerInitialSync();
          transitionToEditor();
          PP.markDirty();
        } catch (err) {
          alert('Could not open file \u2014 invalid or corrupted format.');
          if (typeof console !== 'undefined') console.warn('[PP] Import failed:', err);
        }
      });
    }
  }

  function saveDesignToFile() {
    var name = (S.headline || 'design')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'design';
    Storage.exportFile(S, name + '.pp');
  }

  // ── New Design confirmation ───────────────────────────────────────────

  function showNewDesignConfirm() {
    var existing = Utils.$('#new-design-dropdown');
    if (existing) { existing.remove(); return; }

    var btn = Utils.$('#new-design-btn');
    var dropdown = document.createElement('div');
    dropdown.id = 'new-design-dropdown';
    dropdown.className = 'new-design-dropdown';
    dropdown.setAttribute('role', 'menu');
    dropdown.innerHTML =
      '<button class="new-design-option" id="new-save-first" role="menuitem">' +
        '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2Q2 1 3 1H8L10 3V10Q10 11 9 11H3Q2 11 2 10V2Z" stroke="currentColor" stroke-width="1"/></svg>' +
        'Save first then clear' +
      '</button>' +
      '<button class="new-design-option new-design-danger" id="new-discard" role="menuitem">' +
        '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2L10 10M10 2L2 10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>' +
        'Discard and start fresh' +
      '</button>';

    btn.parentNode.style.position = 'relative';
    btn.parentNode.appendChild(dropdown);

    var rect = btn.getBoundingClientRect();
    var parentRect = btn.parentNode.getBoundingClientRect();
    dropdown.style.top = (rect.bottom - parentRect.top + 4) + 'px';
    dropdown.style.left = (rect.left - parentRect.left) + 'px';

    Utils.$('#new-save-first').addEventListener('click', function () {
      dropdown.remove();
      saveDesignToFile();
      clearSession();
    });

    Utils.$('#new-discard').addEventListener('click', function () {
      dropdown.remove();
      clearSession();
    });

    var closeHandler = function (e) {
      if (!dropdown.contains(e.target) && e.target !== btn) {
        dropdown.remove();
        document.removeEventListener('click', closeHandler, true);
      }
    };
    setTimeout(function () {
      document.addEventListener('click', closeHandler, true);
    }, 0);

    dropdown.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        dropdown.remove();
        btn.focus();
      }
    });

    Utils.$('#new-save-first').focus();
  }

  async function clearSession() {
    await Storage.clear();
    location.reload();
  }

  // ══════════════════════════════════════════════════════════════════════
  // STEP 1 — UPLOAD
  // ══════════════════════════════════════════════════════════════════════

  function initUploadStep() {
    var zone      = Utils.$('#upload-zone');
    var fileInput = Utils.$('#file-input');
    var browseBtn = Utils.$('#browse-btn');

    browseBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      fileInput.click();
    });

    Upload.init(zone, fileInput, function (slides) {
      var isTablet = Devices.isTablet(S.activeDevice);
      var settings = PP.captureCurrentSettings();
      slides.forEach(function (s) {
        Object.assign(s, settings);
        s.tabletImageData = isTablet ? s.imageData : null;
      });
      S.slides = slides;
      S.activeSlideIndex = 0;
      transitionToEditor();
      PP.markDirty();
    });

    zone.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // STEP 2 — EDITOR
  // ══════════════════════════════════════════════════════════════════════

  function initEditor() {
    Editor.init(Utils.$('#main-canvas'));

    // Render template grid
    Templates.renderGrid(
      Utils.$('#template-grid'),
      S.templateId,
      onTemplateSelect
    );

    // Wire sidebar controls (from extracted modules)
    PP.wireDevicePicker();
    PP.wireTextFields();
    PP.wireLayoutControls();
    PP.wireBgControls();
    PP.wireSlidePanel();
    wireHeaderBtns();

    // Sync canvas IText edits back to State
    Editor._onTextChange = function (key, value) {
      if (key === 'headline') {
        S.headline = value;
      } else if (key === 'subheadline') {
        S.subheadline = value;
      }
      PP.markDirty();
    };

    // Sync canvas drag/rotate back to State
    Editor._onLayoutChange = function (target, data) {
      S._batch(function () {
        if (target === 'phone') {
          S.phoneXFrac = data.xFrac;
          S.phoneYFrac = data.yFrac;
          S.phoneAngle = data.angle;
        } else if (target === 'headline') {
          S.headlineXFrac = data.xFrac;
          S.headlineYFrac = data.yFrac;
          S.headlineAngle = data.angle;
        } else if (target === 'subheadline') {
          S.subheadlineXFrac = data.xFrac;
          S.subheadlineYFrac = data.yFrac;
          S.subheadlineAngle = data.angle;
        }
      });
      PP.markDirty();
    };
  }

  // ── applyCurrentTemplate (exposed via PP for other modules) ──────────

  PP.applyCurrentTemplate = function () {
    Editor.applyTemplate(S.templateId, true, PP.getLayoutOverrides());
    Editor.updateText({
      headline:         S.headline,
      subheadline:      S.subheadline,
      headlineSize:     S.headlineSize,
      subheadlineSize:  S.subheadlineSize,
      textColor:        S.textColor,
      subheadlineColor: S.subheadlineColor,
    });
  };

  function transitionToEditor() {
    Utils.$('#step-upload').classList.remove('active');
    Utils.$('#step-editor').classList.add('active');

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        Utils.$('#canvas-wrapper').classList.add('loaded');
        var firstInput = Utils.$('#headline-input');
        if (firstInput) firstInput.focus();
      });
    });

    PP.renderSlideList();
    PP.loadActiveSlide();
    PP.renderCanvasStrip();
    PP.updateExportCounts();
  }

  // ── Template ─────────────────────────────────────────────────────────

  function onTemplateSelect(id) {
    S.templateId = id;
    var tmpl = Templates.getById(id);

    PP.resetLayoutOverrides();

    S._batch(function () {
      if (tmpl.bg.type === 'split') {
        S.bgType       = 'split';
        S.bgSplitTop   = tmpl.bg.top;
        S.bgSplitBottom = tmpl.bg.bottom;
      } else if (tmpl.bg.type === 'gradient') {
        S.bgType  = 'gradient';
        S.bgFrom  = tmpl.bg.from;
        S.bgTo    = tmpl.bg.to;
        S.bgAngle = tmpl.bg.angle;
      } else if (tmpl.bg.type === 'solid') {
        S.bgType  = 'solid';
        S.bgSolid = tmpl.bg.color;
      }
    });

    PP.autoTextColor();
    PP.applyCurrentTemplate();
    PP.markDirty();
  }

  // ── Header Buttons ────────────────────────────────────────────────────

  function wireHeaderBtns() {
    Utils.$('#export-btn').addEventListener('click', openExportOverlay);
  }

  // ══════════════════════════════════════════════════════════════════════
  // STEP 3 — EXPORT
  // ══════════════════════════════════════════════════════════════════════

  function initExportOverlay() {
    Utils.$('#export-close').addEventListener('click', closeExportOverlay);
    Utils.$('#export-backdrop').addEventListener('click', closeExportOverlay);
    Utils.$('#do-export-btn').addEventListener('click', runExport);
    Utils.$('#copy-btn').addEventListener('click', copyCurrentSlide);

    var iosCheck = Utils.$('#export-ios');
    var androidCheck = Utils.$('#export-android');
    if (iosCheck) iosCheck.addEventListener('change', function () { PP.updateExportCounts(); });
    if (androidCheck) androidCheck.addEventListener('change', function () { PP.updateExportCounts(); });

    var panel = Utils.$('.overlay-panel');
    if (panel) {
      panel.addEventListener('keydown', function (e) {
        if (e.key !== 'Tab') return;
        var focusable = panel.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable.length) return;
        var first = focusable[0];
        var last  = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      });
    }
  }

  function openExportOverlay() {
    PP.updateExportCounts();
    Utils.show(Utils.$('#export-overlay'));
    Utils.$('#export-progress-wrap').classList.add('hidden');
    Utils.show(Utils.$('#export-cta'));
    requestAnimationFrame(function () {
      var firstBtn = Utils.$('#do-export-btn');
      if (firstBtn) firstBtn.focus();
    });
  }

  function closeExportOverlay() {
    Utils.hide(Utils.$('#export-overlay'));
    var exportBtn = Utils.$('#export-btn');
    if (exportBtn) exportBtn.focus();
  }

  PP.updateExportCounts = function () {
    var slideCount = S.slides.length;
    var totalFiles = 0;

    ['ios', 'android'].forEach(function (os) {
      var osSpecCount = 0;
      (Devices.OS_DEVICES[os] || []).forEach(function (dev) {
        var specs = Devices.EXPORT_SPECS[dev] || [];
        osSpecCount += specs.length;
      });
      totalFiles += slideCount * osSpecCount;

      var countEl = Utils.$('#export-' + os + '-count');
      if (countEl) countEl.textContent = slideCount ? '(' + slideCount + ' slides)' : '(0 slides)';
    });

    var subEl = Utils.$('#export-sub');
    if (subEl) subEl.textContent = 'Ready to generate ' + slideCount + ' screenshots across selected platforms';

    var fileCountEl = Utils.$('#export-file-count');
    if (fileCountEl) fileCountEl.textContent = totalFiles;

    buildExportSpecGrid();
  };

  function buildExportSpecGrid() {
    var grid = Utils.$('#export-specs-grid');
    if (!grid) return;
    grid.innerHTML = '';

    var columns = [
      { os: 'ios', title: 'iOS App Store', icon: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 1H10Q11 1 11 2V12Q11 13 10 13H4Q3 13 3 12V2Q3 1 4 1Z" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/></svg>' },
      { os: 'android', title: 'Google Play', icon: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 4H12Q13 4 13 5V10Q13 11 12 11H2Q1 11 1 10V5Q1 4 2 4Z" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/><circle cx="7" cy="2" r="0.8" fill="currentColor"/></svg>' },
    ];

    columns.forEach(function (col) {
      var div = document.createElement('div');
      div.className = 'spec-column';
      var titleDiv = document.createElement('div');
      titleDiv.className = 'spec-column-title';
      titleDiv.innerHTML = col.icon + ' ' + col.title;
      div.appendChild(titleDiv);

      var specList = document.createElement('div');
      specList.className = 'spec-list';

      (Devices.OS_DEVICES[col.os] || []).forEach(function (dev) {
        (Devices.EXPORT_SPECS[dev] || []).forEach(function (spec) {
          var row = document.createElement('div');
          row.className = 'spec-row';
          row.innerHTML = '<span class="spec-name">' + spec.label + '</span><span class="spec-dim">' + spec.w + ' &times; ' + spec.h + '</span>';
          specList.appendChild(row);
        });
      });

      div.appendChild(specList);
      grid.appendChild(div);
    });
  }

  async function runExport() {
    var btn = Utils.$('#do-export-btn');
    btn.disabled = true;
    btn.textContent = 'Generating\u2026';

    var progressWrap = Utils.$('#export-progress-wrap');
    var progressFill = Utils.$('#progress-fill');
    var progressStat = Utils.$('#progress-status');
    var cta          = Utils.$('#export-cta');

    progressWrap.classList.remove('hidden');
    progressFill.classList.add('animating');
    cta.style.opacity = '0.4';
    cta.style.pointerEvents = 'none';

    var selectedOSes = [];
    if (Utils.$('#export-ios') && Utils.$('#export-ios').checked) selectedOSes.push('ios');
    if (Utils.$('#export-android') && Utils.$('#export-android').checked) selectedOSes.push('android');

    try {
      await Exporter.run({
        slides: S.slides,
        selectedOSes: selectedOSes,
        onProgress: function (current, total, label) {
          var pct = Math.round((current / total) * 100);
          progressFill.style.width = pct + '%';
          progressStat.textContent = label;
        },
      });
    } catch (err) {
      progressStat.textContent = 'Export failed \u2014 please try again.';
    }

    progressFill.classList.remove('animating');
    progressWrap.classList.add('hidden');
    cta.style.opacity = '';
    cta.style.pointerEvents = '';
    btn.disabled = false;

    var downloadIcon = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none">' +
        '<path d="M8 2V10M8 10L5 7M8 10L11 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M3 13H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
      '</svg>';

    if (!progressStat.textContent.includes('failed')) {
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none">' +
        '<path d="M3 8L6.5 11.5L13 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg> Done \u2014 ZIP downloaded';
      btn.style.background = '#16a34a';
      setTimeout(function () {
        btn.style.background = '';
        btn.innerHTML = downloadIcon + ' Download ZIP';
      }, 3000);
    } else {
      btn.innerHTML = downloadIcon + ' Download ZIP';
    }
  }

  // ── Copy current slide to clipboard ──────────────────────────────────

  async function copyCurrentSlide() {
    var slide = S.slides[S.activeSlideIndex];
    if (!slide) return;

    var btn = Utils.$('#copy-btn');
    btn.disabled = true;

    var blob = null;
    try {
      var deviceSpecs = Devices.EXPORT_SPECS[S.activeDevice] || [];
      var spec = deviceSpecs[0] || { w: 1260, h: 2736 };
      await document.fonts.load('bold 40px Syne').catch(function () {});

      var tmpl = Templates.getById(S.templateId);
      var frameImg = await Exporter._loadFrame(Devices.FRAME_PATH[S.activeDevice]).catch(function () { return null; });
      var imgSrc = PP.getSlideImage(slide);
      var screenshotImg = await Exporter._loadImage(imgSrc).catch(function () { return null; });

      blob = await Exporter._renderSlide({
        spec: spec,
        device: S.activeDevice,
        tmpl: tmpl,
        bgState: {
          bgType: S.bgType, bgFrom: S.bgFrom, bgTo: S.bgTo,
          bgAngle: S.bgAngle, bgSolid: S.bgSolid,
          bgSplitTop: S.bgSplitTop, bgSplitBottom: S.bgSplitBottom,
        },
        textState: Editor.getTextState(),
        layoutState: PP.getLayoutOverrides(),
        screenshotImg: screenshotImg,
        frameImg: frameImg,
      });

      if (blob && navigator.clipboard && navigator.clipboard.write) {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ]);
          btn.classList.add('copied');
          var originalHTML = btn.innerHTML;
          btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none">' +
            '<path d="M2 6L5 9L10 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
          '</svg> Copied!';
          setTimeout(function () {
            btn.innerHTML = originalHTML;
            btn.classList.remove('copied');
          }, 2000);
        } catch (_) {
          saveAs(blob, 'screenshot_' + spec.w + 'x' + spec.h + '.png');
        }
      } else if (blob) {
        saveAs(blob, 'screenshot_' + spec.w + 'x' + spec.h + '.png');
      }
    } catch (_) {
      if (blob) saveAs(blob, 'screenshot_' + spec.w + 'x' + spec.h + '.png');
    }

    btn.disabled = false;
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────

  function _isFocusedOnInput() {
    var tag = document.activeElement && document.activeElement.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
           (document.activeElement && document.activeElement.isContentEditable);
  }

  document.addEventListener('keydown', function (e) {
    var editorActive = Utils.$('#step-editor').classList.contains('active');

    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      if (editorActive) saveDesignToFile();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
      e.preventDefault();
      var fileIn = Utils.$('#load-file-input');
      if (fileIn) fileIn.click();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
      e.preventDefault();
      if (editorActive) openExportOverlay();
    }
    if (e.key === 'Escape') {
      var dropdown = Utils.$('#new-design-dropdown');
      if (dropdown) { dropdown.remove(); return; }
      closeExportOverlay();
    }

    if (_isFocusedOnInput()) return;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      if (editorActive && S.slides.length > 1) {
        var next = (S.activeSlideIndex + 1) % S.slides.length;
        if (next !== S.activeSlideIndex) {
          S.activeSlideIndex = next;
          Utils.$$('.slide-item').forEach(function (el, i) {
            el.classList.toggle('active', i === next);
            el.setAttribute('aria-selected', i === next ? 'true' : 'false');
            el.setAttribute('tabindex', i === next ? '0' : '-1');
          });
          var activeItem = Utils.$('.slide-item.active');
          if (activeItem) activeItem.focus();
          PP.loadActiveSlide();
          PP.renderCanvasStrip();
          PP.markDirty();
        }
      }
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      if (editorActive && S.slides.length > 1) {
        var prev = (S.activeSlideIndex - 1 + S.slides.length) % S.slides.length;
        if (prev !== S.activeSlideIndex) {
          S.activeSlideIndex = prev;
          Utils.$$('.slide-item').forEach(function (el, i) {
            el.classList.toggle('active', i === prev);
            el.setAttribute('aria-selected', i === prev ? 'true' : 'false');
            el.setAttribute('tabindex', i === prev ? '0' : '-1');
          });
          var activeItem2 = Utils.$('.slide-item.active');
          if (activeItem2) activeItem2.focus();
          PP.loadActiveSlide();
          PP.renderCanvasStrip();
          PP.markDirty();
        }
      }
    }
  });

})();
