/**
 * Painless Pixels — App Orchestrator
 *
 * Manages global state, wires UI events to Editor/Upload/Exporter modules,
 * and drives step transitions.
 */
(function () {
  'use strict';

  // ── Defaults (single source of truth) ─────────────────────────────────

  const DEFAULTS = {
    device:        'iphone',
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

  // ── State (initialized from DEFAULTS) ──────────────────────────────────

  const State = Object.assign({
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
  }, DEFAULTS);

  // ── Save status indicator ──────────────────────────────────────────────

  let _saveFlashTimer = null;

  function flashSaveStatus() {
    const el = Utils.$('#save-status');
    if (!el) return;
    // Clear any pending fade-out to prevent flicker
    if (_saveFlashTimer) clearTimeout(_saveFlashTimer);
    el.textContent = '';
    // Re-set text in next microtask so aria-live re-announces
    requestAnimationFrame(() => {
      el.textContent = 'Auto-saved';
      el.classList.add('visible');
      _saveFlashTimer = setTimeout(() => {
        el.classList.remove('visible');
        _saveFlashTimer = null;
      }, 2000);
    });
  }

  function showSaveError() {
    const el = Utils.$('#save-status');
    if (!el) return;
    if (_saveFlashTimer) clearTimeout(_saveFlashTimer);
    el.textContent = 'Save failed';
    el.classList.add('visible', 'error');
    // Error state persists — don't auto-dismiss
  }

  // ── Boot ────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', async () => {
    Theme.init();
    Storage.init({
      onSave: flashSaveStatus,
      onError: function (type) {
        if (type === 'idb-unavailable') {
          showSaveError();
          const el = Utils.$('#save-status');
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

    let saved = null;
    try {
      const raw = await Storage.load();
      if (raw) saved = Storage.deserialize(raw, DEFAULTS);
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('[PP] Failed to load session:', e);
    }

    if (saved && saved.slides && saved.slides.length) {
      Utils.$('#step-upload').classList.remove('active');
      restoreState(saved);
      syncAllControls();
      transitionToEditor();

      // Show restore banner if session is older than 5 minutes
      if (saved._savedAt) {
        const age = Date.now() - new Date(saved._savedAt).getTime();
        if (age > 5 * 60 * 1000) {
          showRestoreBanner(saved._savedAt);
        }
      }
    } else {
      initUploadStep();
      // Upload screen is already active from HTML
    }
  });

  // ── Session restore banner ────────────────────────────────────────────

  function showRestoreBanner(savedAt) {
    const banner = document.createElement('div');
    banner.className = 'restore-banner';
    banner.setAttribute('role', 'status');

    const age = Date.now() - new Date(savedAt).getTime();
    let label;
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
    banner.querySelector('.restore-banner-close').addEventListener('click', () => {
      banner.remove();
    });

    // Auto-dismiss after 8 seconds
    setTimeout(() => {
      if (banner.parentNode) banner.remove();
    }, 8000);
  }

  // ── Auto-save helper ────────────────────────────────────────────────────

  function markDirty() {
    Storage.scheduleSave(State);
  }

  // ── Restore from saved data ───────────────────────────────────────────

  function restoreState(data) {
    // Trust deserialize output — it already validated and applied defaults
    State.slides           = data.slides;
    State.activeSlideIndex = data.activeSlideIndex;
    State.device           = data.device;
    State.templateId       = data.templateId;
    State.bgType           = data.bgType;
    State.bgFrom           = data.bgFrom;
    State.bgTo             = data.bgTo;
    State.bgAngle          = data.bgAngle;
    State.bgSolid          = data.bgSolid;
    State.bgSplitTop       = data.bgSplitTop;
    State.bgSplitBottom    = data.bgSplitBottom;
    State.headline          = data.headline;
    State.subheadline       = data.subheadline;
    State.headlineSize      = data.headlineSize;
    State.subheadlineSize   = data.subheadlineSize;
    State.textColor         = data.textColor;
    State.subheadlineColor  = data.subheadlineColor;
    State.phoneXFrac        = typeof data.phoneXFrac === 'number' ? data.phoneXFrac : null;
    State.phoneYFrac        = typeof data.phoneYFrac === 'number' ? data.phoneYFrac : null;
    State.phoneAngle        = typeof data.phoneAngle === 'number' ? data.phoneAngle : 0;
    State.headlineXFrac     = typeof data.headlineXFrac === 'number' ? data.headlineXFrac : null;
    State.headlineYFrac     = typeof data.headlineYFrac === 'number' ? data.headlineYFrac : null;
    State.headlineAngle     = typeof data.headlineAngle === 'number' ? data.headlineAngle : 0;
    State.subheadlineXFrac  = typeof data.subheadlineXFrac === 'number' ? data.subheadlineXFrac : null;
    State.subheadlineYFrac  = typeof data.subheadlineYFrac === 'number' ? data.subheadlineYFrac : null;
    State.subheadlineAngle  = typeof data.subheadlineAngle === 'number' ? data.subheadlineAngle : 0;
  }

  function syncAllControls() {
    // Text fields
    const hlInput    = Utils.$('#headline-input');
    const slInput    = Utils.$('#subheadline-input');
    const sizeInput  = Utils.$('#headline-size');
    const slSizeInput = Utils.$('#subheadline-size');
    const colorEl    = Utils.$('#text-color');
    const hexLabel   = Utils.$('#text-color-hex');
    const slColorEl  = Utils.$('#subheadline-color');
    const slHexLabel = Utils.$('#subheadline-color-hex');
    if (hlInput)     hlInput.value          = State.headline;
    if (slInput)     slInput.value          = State.subheadline;
    if (sizeInput)   sizeInput.value        = State.headlineSize;
    if (slSizeInput) slSizeInput.value      = State.subheadlineSize;
    if (colorEl)     colorEl.value          = State.textColor;
    if (hexLabel)    hexLabel.textContent   = State.textColor;
    if (slColorEl)   slColorEl.value        = State.subheadlineColor;
    if (slHexLabel)  slHexLabel.textContent = State.subheadlineColor;

    // Layout controls
    syncLayoutControls();

    // Background controls
    syncBgControls();

    // Device picker
    Utils.$$('.device-btn').forEach(btn => {
      const isActive = btn.dataset.device === State.device;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    Editor.switchDevice(State.device);

    // Template picker
    Templates.renderGrid(
      Utils.$('#template-grid'),
      State.templateId,
      onTemplateSelect
    );
  }

  // ── File operations ───────────────────────────────────────────────────

  function wireFileOperations() {
    const saveBtn  = Utils.$('#save-design-btn');
    const openBtn  = Utils.$('#load-design-btn');
    const newBtn   = Utils.$('#new-design-btn');
    const fileIn   = Utils.$('#load-file-input');
    const uploadOpen = Utils.$('#upload-open-btn');

    if (saveBtn) saveBtn.addEventListener('click', saveDesignToFile);
    if (openBtn) openBtn.addEventListener('click', () => fileIn && fileIn.click());
    if (newBtn)  newBtn.addEventListener('click', showNewDesignConfirm);
    if (uploadOpen) uploadOpen.addEventListener('click', () => fileIn && fileIn.click());

    if (fileIn) {
      fileIn.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        try {
          const raw = await Storage.importFile(file);
          const data = Storage.deserialize(raw, DEFAULTS);
          if (!data || !data.slides.length) {
            alert('Could not load design — no valid slides found.');
            return;
          }
          restoreState(data);
          syncAllControls();
          transitionToEditor();
          markDirty();
        } catch (err) {
          alert('Could not open file — invalid or corrupted format.');
          if (typeof console !== 'undefined') console.warn('[PP] Import failed:', err);
        }
      });
    }
  }

  function saveDesignToFile() {
    // Generate filename from headline
    const name = (State.headline || 'design')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'design';
    Storage.exportFile(State, name + '.pp');
  }

  // ── New Design confirmation (inline, not confirm()) ───────────────────

  function showNewDesignConfirm() {
    // Remove any existing dropdown
    const existing = Utils.$('#new-design-dropdown');
    if (existing) { existing.remove(); return; }

    const btn = Utils.$('#new-design-btn');
    const dropdown = document.createElement('div');
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

    // Position below the New button
    const rect = btn.getBoundingClientRect();
    const parentRect = btn.parentNode.getBoundingClientRect();
    dropdown.style.top = (rect.bottom - parentRect.top + 4) + 'px';
    dropdown.style.left = (rect.left - parentRect.left) + 'px';

    Utils.$('#new-save-first').addEventListener('click', () => {
      dropdown.remove();
      saveDesignToFile();
      clearSession();
    });

    Utils.$('#new-discard').addEventListener('click', () => {
      dropdown.remove();
      clearSession();
    });

    // Close on outside click
    const closeHandler = (e) => {
      if (!dropdown.contains(e.target) && e.target !== btn) {
        dropdown.remove();
        document.removeEventListener('click', closeHandler, true);
      }
    };
    // Delay to avoid the current click closing it immediately
    setTimeout(() => {
      document.addEventListener('click', closeHandler, true);
    }, 0);

    // Close on Escape
    dropdown.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        dropdown.remove();
        btn.focus();
      }
    });

    // Focus first option
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
    const zone      = Utils.$('#upload-zone');
    const fileInput = Utils.$('#file-input');
    const browseBtn = Utils.$('#browse-btn');

    browseBtn.addEventListener('click', e => {
      e.stopPropagation();  // prevent zone click from also firing
      fileInput.click();
    });

    Upload.init(zone, fileInput, (slides) => {
      State.slides = slides;
      State.activeSlideIndex = 0;
      transitionToEditor();
      markDirty();
    });

    // Keyboard accessibility: Enter/Space activates the zone like a button
    zone.addEventListener('keydown', (e) => {
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
    // Init canvas
    Editor.init(Utils.$('#main-canvas'));

    // Render template grid
    Templates.renderGrid(
      Utils.$('#template-grid'),
      State.templateId,
      onTemplateSelect
    );

    // Wire sidebar controls (all debounced at 150 ms)
    wireDevicePicker();
    wireTextFields();
    wireLayoutControls();
    wireBgControls();
    wireSlidePanel();
    wireHeaderBtns();

    // Sync canvas IText edits back to State so template switches don't overwrite user text
    Editor._onTextChange = (key, value) => {
      if (key === 'headline') {
        State.headline = value;
        const el = Utils.$('#headline-input');
        if (el) el.value = value;
      } else if (key === 'subheadline') {
        State.subheadline = value;
        const el = Utils.$('#subheadline-input');
        if (el) el.value = value;
      }
      markDirty();
    };

    // Sync canvas drag/rotate back to State
    Editor._onLayoutChange = (target, data) => {
      if (target === 'phone') {
        State.phoneXFrac = data.xFrac;
        State.phoneYFrac = data.yFrac;
        State.phoneAngle = data.angle;
      } else if (target === 'headline') {
        State.headlineXFrac = data.xFrac;
        State.headlineYFrac = data.yFrac;
        State.headlineAngle = data.angle;
      } else if (target === 'subheadline') {
        State.subheadlineXFrac = data.xFrac;
        State.subheadlineYFrac = data.yFrac;
        State.subheadlineAngle = data.angle;
      }
      syncLayoutControls();
      markDirty();
    };
  }

  function transitionToEditor() {
    Utils.$('#step-upload').classList.remove('active');
    Utils.$('#step-editor').classList.add('active');

    // Give the canvas wrapper the "loaded" class for animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        Utils.$('#canvas-wrapper').classList.add('loaded');
        const firstInput = Utils.$('#headline-input');
        if (firstInput) firstInput.focus();
      });
    });

    renderSlideList();
    loadActiveSlide();
    applyCurrentTemplate();
    updateExportCounts();
  }

  // ── Template ─────────────────────────────────────────────────────────

  function onTemplateSelect(id) {
    State.templateId = id;
    const tmpl = Templates.getById(id);

    // Reset custom position/rotation overrides
    resetLayoutOverrides();
    syncLayoutControls();

    // Sync sidebar controls to template defaults
    if (tmpl.bg.type === 'split') {
      State.bgType       = 'split';
      State.bgSplitTop   = tmpl.bg.top;
      State.bgSplitBottom = tmpl.bg.bottom;
    } else if (tmpl.bg.type === 'gradient') {
      State.bgType  = 'gradient';
      State.bgFrom  = tmpl.bg.from;
      State.bgTo    = tmpl.bg.to;
      State.bgAngle = tmpl.bg.angle;
    } else if (tmpl.bg.type === 'solid') {
      State.bgType  = 'solid';
      State.bgSolid = tmpl.bg.color;
    }
    syncBgControls();
    applyCurrentTemplate();
    markDirty();
  }

  function applyCurrentTemplate() {
    Editor.applyTemplate(State.templateId, true, getLayoutOverrides()); // skip internal renderAll
    autoTextColor();
    Editor.updateText({                           // this one calls renderAll
      headline:         State.headline,
      subheadline:      State.subheadline,
      headlineSize:     State.headlineSize,
      subheadlineSize:  State.subheadlineSize,
      textColor:        State.textColor,
      subheadlineColor: State.subheadlineColor,
    });
  }

  /** Pick white or dark text based on current background luminance */
  function autoTextColor() {
    let dominant;
    if (State.bgType === 'gradient') {
      dominant = Utils.averageHex(State.bgFrom, State.bgTo);
    } else if (State.bgType === 'solid') {
      dominant = State.bgSolid;
    } else if (State.bgType === 'split') {
      dominant = State.bgSplitTop; // headline sits in top half
    } else {
      return;
    }

    const isLight  = Utils.isLight(dominant);
    const color    = isLight ? '#111111' : '#ffffff';
    const subColor = isLight ? '#555555' : '#aaaaaa';
    State.textColor        = color;
    State.subheadlineColor = subColor;

    // Sync sidebar color pickers
    const colorEl    = Utils.$('#text-color');
    const hexLabel   = Utils.$('#text-color-hex');
    const slColorEl  = Utils.$('#subheadline-color');
    const slHexLabel = Utils.$('#subheadline-color-hex');
    if (colorEl)    colorEl.value          = color;
    if (hexLabel)   hexLabel.textContent   = color;
    if (slColorEl)  slColorEl.value        = subColor;
    if (slHexLabel) slHexLabel.textContent = subColor;
  }

  // ── Device Picker ─────────────────────────────────────────────────────

  function wireDevicePicker() {
    Utils.$$('.device-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const device = btn.dataset.device;
        if (device === State.device) return;
        State.device = device;
        Utils.setActive(btn);
        Utils.$$('.device-btn').forEach(b => {
          b.setAttribute('aria-pressed', b.dataset.device === device ? 'true' : 'false');
        });
        Editor.switchDevice(device);
        loadActiveSlide();

        // Adjust slide-item aspect ratio in the sidebar
        updateSlideAspectRatio();
        markDirty();
      });
    });
  }

  function updateSlideAspectRatio() {
    const design = Devices.DESIGN[State.device];
    const ar     = design.w / design.h;
    Utils.$$('.slide-item').forEach(el => {
      el.style.aspectRatio = `${design.w} / ${design.h}`;
    });
  }

  // ── Text Fields ───────────────────────────────────────────────────────

  function wireTextFields() {
    const hlInput     = Utils.$('#headline-input');
    const slInput     = Utils.$('#subheadline-input');
    const sizeInput   = Utils.$('#headline-size');
    const slSizeInput = Utils.$('#subheadline-size');
    const colorEl     = Utils.$('#text-color');
    const hexLabel    = Utils.$('#text-color-hex');
    const slColorEl   = Utils.$('#subheadline-color');
    const slHexLabel  = Utils.$('#subheadline-color-hex');

    // Set initial values
    hlInput.value   = State.headline;
    slInput.value   = State.subheadline;
    sizeInput.value = State.headlineSize;
    colorEl.value   = State.textColor;
    if (slSizeInput) slSizeInput.value      = State.subheadlineSize;
    if (slColorEl)   slColorEl.value        = State.subheadlineColor;
    if (slHexLabel)  slHexLabel.textContent = State.subheadlineColor;

    hlInput.addEventListener('input', () => {
      State.headline = hlInput.value;
      debouncedTextUpdate();
      markDirty();
    });

    slInput.addEventListener('input', () => {
      State.subheadline = slInput.value;
      debouncedTextUpdate();
      markDirty();
    });

    sizeInput.addEventListener('input', () => {
      State.headlineSize = parseInt(sizeInput.value, 10) || 38;
      debouncedTextUpdate();
      markDirty();
    });

    colorEl.addEventListener('input', () => {
      State.textColor = colorEl.value;
      hexLabel.textContent = colorEl.value;
      debouncedTextUpdate();
      markDirty();
    });

    if (slSizeInput) {
      slSizeInput.addEventListener('input', () => {
        State.subheadlineSize = parseInt(slSizeInput.value, 10) || 20;
        debouncedTextUpdate();
        markDirty();
      });
    }

    if (slColorEl) {
      slColorEl.addEventListener('input', () => {
        State.subheadlineColor = slColorEl.value;
        slHexLabel.textContent = slColorEl.value;
        debouncedTextUpdate();
        markDirty();
      });
    }
  }

  // ── Background Controls ───────────────────────────────────────────────

  function wireBgControls() {
    // Toggle gradient / solid
    Utils.$$('.bg-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.bg;
        State.bgType = type;
        Utils.setActive(btn);
        Utils.$$('.bg-toggle-btn').forEach(b => {
          b.setAttribute('aria-pressed', b.dataset.bg === type ? 'true' : 'false');
        });
        Utils.$('#bg-gradient-pane').classList.toggle('active', type === 'gradient');
        Utils.$('#bg-solid-pane').classList.toggle('active', type === 'solid');
        applyBgUpdate();
      });
    });

    // Gradient from
    const fromEl      = Utils.$('#bg-from');
    const fromHex     = Utils.$('#bg-from-hex');
    fromEl.addEventListener('input', () => {
      State.bgFrom = fromEl.value;
      fromHex.textContent = fromEl.value;
      applyBgUpdate();
    });

    // Gradient to
    const toEl        = Utils.$('#bg-to');
    const toHex       = Utils.$('#bg-to-hex');
    toEl.addEventListener('input', () => {
      State.bgTo = toEl.value;
      toHex.textContent = toEl.value;
      applyBgUpdate();
    });

    // Angle
    const angleEl     = Utils.$('#bg-angle');
    const angleDisplay = Utils.$('#angle-display');
    angleEl.addEventListener('input', () => {
      State.bgAngle = parseInt(angleEl.value, 10);
      angleDisplay.textContent = State.bgAngle + '°';
      applyBgUpdate();
    });

    // Solid
    const solidEl     = Utils.$('#bg-solid');
    const solidHex    = Utils.$('#bg-solid-hex');
    solidEl.addEventListener('input', () => {
      State.bgSolid = solidEl.value;
      solidHex.textContent = solidEl.value;
      applyBgUpdate();
    });

    // Init control values
    syncBgControls();
  }

  function syncBgControls() {
    const fromEl       = Utils.$('#bg-from');
    const fromHex      = Utils.$('#bg-from-hex');
    const toEl         = Utils.$('#bg-to');
    const toHex        = Utils.$('#bg-to-hex');
    const angleEl      = Utils.$('#bg-angle');
    const angleDisplay = Utils.$('#angle-display');
    const solidEl      = Utils.$('#bg-solid');
    const solidHex     = Utils.$('#bg-solid-hex');

    if (fromEl)  { fromEl.value = State.bgFrom;  fromHex.textContent  = State.bgFrom; }
    if (toEl)    { toEl.value   = State.bgTo;    toHex.textContent    = State.bgTo; }
    if (angleEl) { angleEl.value = State.bgAngle; angleDisplay.textContent = State.bgAngle + '°'; }
    if (solidEl) { solidEl.value = State.bgSolid; solidHex.textContent    = State.bgSolid; }

    // Show correct pane
    Utils.$('#bg-gradient-pane').classList.toggle('active', State.bgType === 'gradient');
    Utils.$('#bg-solid-pane').classList.toggle('active',    State.bgType === 'solid');
    Utils.$$('.bg-toggle-btn').forEach(btn => {
      const isActive = btn.dataset.bg === State.bgType;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  // ── Layout Controls (position & rotation) ────────────────────────────

  function wireLayoutControls() {
    const phoneAngleInput = Utils.$('#phone-angle');
    const hlAngleInput    = Utils.$('#headline-angle');
    const slAngleInput    = Utils.$('#subline-angle');
    const resetBtn        = Utils.$('#reset-layout-btn');

    if (phoneAngleInput) {
      phoneAngleInput.addEventListener('input', () => {
        State.phoneAngle = parseInt(phoneAngleInput.value, 10) || 0;
        Editor.setPhoneAngle(State.phoneAngle);
        markDirty();
      });
    }

    if (hlAngleInput) {
      hlAngleInput.addEventListener('input', () => {
        State.headlineAngle = parseInt(hlAngleInput.value, 10) || 0;
        Editor.setHeadlineAngle(State.headlineAngle);
        markDirty();
      });
    }

    if (slAngleInput) {
      slAngleInput.addEventListener('input', () => {
        State.subheadlineAngle = parseInt(slAngleInput.value, 10) || 0;
        Editor.setSublineAngle(State.subheadlineAngle);
        markDirty();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        resetLayoutOverrides();
        syncLayoutControls();
        applyCurrentTemplate();
        markDirty();
      });
    }
  }

  function syncLayoutControls() {
    const phoneAngleInput = Utils.$('#phone-angle');
    const hlAngleInput    = Utils.$('#headline-angle');
    const slAngleInput    = Utils.$('#subline-angle');
    if (phoneAngleInput) phoneAngleInput.value = State.phoneAngle || 0;
    if (hlAngleInput)    hlAngleInput.value    = State.headlineAngle || 0;
    if (slAngleInput)    slAngleInput.value    = State.subheadlineAngle || 0;
  }

  function resetLayoutOverrides() {
    State.phoneXFrac       = null;
    State.phoneYFrac       = null;
    State.phoneAngle       = 0;
    State.headlineXFrac    = null;
    State.headlineYFrac    = null;
    State.headlineAngle    = 0;
    State.subheadlineXFrac = null;
    State.subheadlineYFrac = null;
    State.subheadlineAngle = 0;
  }

  function getLayoutOverrides() {
    return {
      phoneXFrac:       State.phoneXFrac,
      phoneYFrac:       State.phoneYFrac,
      phoneAngle:       State.phoneAngle,
      headlineXFrac:    State.headlineXFrac,
      headlineYFrac:    State.headlineYFrac,
      headlineAngle:    State.headlineAngle,
      subheadlineXFrac: State.subheadlineXFrac,
      subheadlineYFrac: State.subheadlineYFrac,
      subheadlineAngle: State.subheadlineAngle,
    };
  }

  const debouncedTextUpdate = Utils.debounce(() => {
    Editor.updateText({
      headline:         State.headline,
      subheadline:      State.subheadline,
      headlineSize:     State.headlineSize,
      subheadlineSize:  State.subheadlineSize,
      textColor:        State.textColor,
      subheadlineColor: State.subheadlineColor,
    });
  }, 150);

  const debouncedBgUpdate = Utils.debounce(() => {
    Editor.updateBackground({
      bgType:        State.bgType,
      bgFrom:        State.bgFrom,
      bgTo:          State.bgTo,
      bgAngle:       State.bgAngle,
      bgSolid:       State.bgSolid,
      bgSplitTop:    State.bgSplitTop,
      bgSplitBottom: State.bgSplitBottom,
    });
  }, 50);

  function applyBgUpdate() {
    autoTextColor();
    debouncedBgUpdate();
    debouncedTextUpdate();
    markDirty();
  }

  // ── Slides Panel ──────────────────────────────────────────────────────

  function wireSlidePanel() {
    // "Add slide" button in slides panel header
    Utils.$('#add-slide-btn').addEventListener('click', () => {
      Utils.$('#add-file-input').click();
    });

    Utils.$('#add-file-input').addEventListener('change', async (e) => {
      const newSlides = await Upload.filesToSlides(e.target.files);
      e.target.value = '';
      if (!newSlides.length) return;
      const maxNew = 10 - State.slides.length;
      State.slides.push(...newSlides.slice(0, maxNew));
      renderSlideList();
      updateExportCounts();
      markDirty();
    });

    // "Add screenshots" button in header
    Utils.$('#add-screenshots-btn').addEventListener('click', () => {
      Utils.$('#add-file-input').click();
    });
  }

  function renderSlideList() {
    const list = Utils.$('#slides-list');
    list.innerHTML = '';

    State.slides.forEach((slide, idx) => {
      const item = document.createElement('div');
      item.className = 'slide-item' + (idx === State.activeSlideIndex ? ' active' : '');
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', idx === State.activeSlideIndex ? 'true' : 'false');
      item.setAttribute('aria-label', `Slide ${idx + 1}: ${slide.title}`);
      item.setAttribute('tabindex', idx === State.activeSlideIndex ? '0' : '-1');

      const img = document.createElement('img');
      img.src = slide.imageData;
      img.alt = slide.title;

      const num = document.createElement('div');
      num.className = 'slide-number';
      num.textContent = idx + 1;

      // Reorder buttons (up/down)
      const reorder = document.createElement('div');
      reorder.className = 'slide-reorder';
      const upBtn = document.createElement('button');
      upBtn.className = 'slide-reorder-btn';
      upBtn.setAttribute('aria-label', `Move slide ${idx + 1} up`);
      upBtn.disabled = idx === 0;
      upBtn.innerHTML = `<svg width="8" height="8" viewBox="0 0 8 8" fill="none">
        <path d="M4 6V2M4 2L2 4M4 2L6 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
      const downBtn = document.createElement('button');
      downBtn.className = 'slide-reorder-btn';
      downBtn.setAttribute('aria-label', `Move slide ${idx + 1} down`);
      downBtn.disabled = idx === State.slides.length - 1;
      downBtn.innerHTML = `<svg width="8" height="8" viewBox="0 0 8 8" fill="none">
        <path d="M4 2V6M4 6L2 4M4 6L6 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
      reorder.appendChild(upBtn);
      reorder.appendChild(downBtn);

      const del = document.createElement('button');
      del.className = 'slide-delete';
      del.setAttribute('aria-label', `Remove slide ${idx + 1}`);
      del.innerHTML = `<svg width="8" height="8" viewBox="0 0 8 8" fill="none">
        <path d="M1 1L7 7M7 1L1 7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      </svg>`;

      item.appendChild(img);
      item.appendChild(num);
      item.appendChild(reorder);
      item.appendChild(del);
      list.appendChild(item);

      item.addEventListener('click', (e) => {
        if (e.target.closest('.slide-delete') || e.target.closest('.slide-reorder')) return;
        State.activeSlideIndex = idx;
        Utils.$$('.slide-item').forEach((el, i) => {
          el.classList.toggle('active', i === idx);
          el.setAttribute('aria-selected', i === idx ? 'true' : 'false');
          el.setAttribute('tabindex', i === idx ? '0' : '-1');
        });
        loadActiveSlide();
        markDirty();
      });

      upBtn.addEventListener('click', (e) => { e.stopPropagation(); reorderSlide(idx, -1); });
      downBtn.addEventListener('click', (e) => { e.stopPropagation(); reorderSlide(idx, +1); });

      del.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSlide(idx);
      });
    });

    updateSlideAspectRatio();
  }

  function reorderSlide(idx, delta) {
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= State.slides.length) return;
    const tmp = State.slides[idx];
    State.slides[idx]    = State.slides[newIdx];
    State.slides[newIdx] = tmp;
    if (State.activeSlideIndex === idx) State.activeSlideIndex = newIdx;
    else if (State.activeSlideIndex === newIdx) State.activeSlideIndex = idx;
    renderSlideList();
    updateExportCounts();
    markDirty();
  }

  function loadActiveSlide() {
    const slide = State.slides[State.activeSlideIndex];
    if (slide) Editor.loadSlide(slide);
  }

  function deleteSlide(idx) {
    State.slides.splice(idx, 1);
    if (State.activeSlideIndex >= State.slides.length) {
      State.activeSlideIndex = Math.max(0, State.slides.length - 1);
    }
    renderSlideList();
    if (State.slides.length) {
      loadActiveSlide();
    }
    updateExportCounts();
    markDirty();
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

    // Focus trap for the overlay
    const panel = Utils.$('.overlay-panel');
    if (panel) {
      panel.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;
        const focusable = panel.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last  = focusable[focusable.length - 1];
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
    updateExportCounts();
    Utils.show(Utils.$('#export-overlay'));
    Utils.$('#export-progress-wrap').classList.add('hidden');
    Utils.show(Utils.$('#export-cta'));
    // Move focus into the overlay for keyboard users
    requestAnimationFrame(() => {
      const firstBtn = Utils.$('#do-export-btn');
      if (firstBtn) firstBtn.focus();
    });
  }

  function closeExportOverlay() {
    Utils.hide(Utils.$('#export-overlay'));
    // Return focus to the trigger button
    const exportBtn = Utils.$('#export-btn');
    if (exportBtn) exportBtn.focus();
  }

  function updateExportCounts() {
    const count = State.slides.length;
    const total = count * Devices.EXPORT_SPECS.length;
    const slideCountEl = Utils.$('#export-slide-count');
    const fileCountEl  = Utils.$('#export-file-count');
    if (slideCountEl) slideCountEl.textContent = count;
    if (fileCountEl)  fileCountEl.textContent  = total;
  }

  async function runExport() {
    const btn = Utils.$('#do-export-btn');
    btn.disabled = true;
    btn.textContent = 'Generating…';

    const progressWrap = Utils.$('#export-progress-wrap');
    const progressFill = Utils.$('#progress-fill');
    const progressStat = Utils.$('#progress-status');
    const cta          = Utils.$('#export-cta');

    progressWrap.classList.remove('hidden');
    progressFill.classList.add('animating');
    cta.style.opacity = '0.4';
    cta.style.pointerEvents = 'none';

    const textState = Editor.getTextState();

    try {
      await Exporter.run({
        slides:     State.slides,
        device:     State.device,
        templateId: State.templateId,
        bgState: {
          bgType:        State.bgType,
          bgFrom:        State.bgFrom,
          bgTo:          State.bgTo,
          bgAngle:       State.bgAngle,
          bgSolid:       State.bgSolid,
          bgSplitTop:    State.bgSplitTop,
          bgSplitBottom: State.bgSplitBottom,
        },
        textState,
        layoutState: getLayoutOverrides(),
        onProgress(current, total, label) {
          const pct = Math.round((current / total) * 100);
          progressFill.style.width = pct + '%';
          progressStat.textContent = label;
        },
      });
    } catch (err) {
      progressStat.textContent = 'Export failed — please try again.';
    }

    // Reset UI
    progressFill.classList.remove('animating');
    progressWrap.classList.add('hidden');
    cta.style.opacity = '';
    cta.style.pointerEvents = '';
    btn.disabled = false;

    const downloadIcon = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 2V10M8 10L5 7M8 10L11 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M3 13H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>`;

    // Show success state briefly if export succeeded (no error in progressStat)
    if (!progressStat.textContent.includes('failed')) {
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M3 8L6.5 11.5L13 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg> Done — ZIP downloaded`;
      btn.style.background = '#16a34a';
      setTimeout(() => {
        btn.style.background = '';
        btn.innerHTML = `${downloadIcon} Download ZIP`;
      }, 3000);
    } else {
      btn.innerHTML = `${downloadIcon} Download ZIP`;
    }
  }

  // ── Copy current slide to clipboard ──────────────────────────────────

  async function copyCurrentSlide() {
    const slide = State.slides[State.activeSlideIndex];
    if (!slide) return;

    const btn = Utils.$('#copy-btn');
    btn.disabled = true;

    let blob = null;
    try {
      // Render at iPhone primary size (1260×2736)
      const spec = Devices.EXPORT_SPECS[0];
      await document.fonts.load('bold 40px Syne').catch(() => {});

      const tmpl = Templates.getById(State.templateId);
      const frameImg = await Exporter._loadImage(Devices.FRAME_PATH[State.device]).catch(() => null);
      const screenshotImg = await Exporter._loadImage(slide.imageData).catch(() => null);

      blob = await Exporter._renderSlide({
        spec,
        device: State.device,
        tmpl,
        bgState: {
          bgType: State.bgType, bgFrom: State.bgFrom, bgTo: State.bgTo,
          bgAngle: State.bgAngle, bgSolid: State.bgSolid,
          bgSplitTop: State.bgSplitTop, bgSplitBottom: State.bgSplitBottom,
        },
        textState: Editor.getTextState(),
        layoutState: getLayoutOverrides(),
        screenshotImg,
        frameImg,
      });

      if (blob && navigator.clipboard && navigator.clipboard.write) {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ]);
          btn.classList.add('copied');
          const originalHTML = btn.innerHTML;
          btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6L5 9L10 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg> Copied!`;
          setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.classList.remove('copied');
          }, 2000);
        } catch (_) {
          // Clipboard write failed (e.g. focus lost, denied) — fall through to saveAs
          saveAs(blob, `screenshot_${spec.w}x${spec.h}.png`);
        }
      } else if (blob) {
        saveAs(blob, `screenshot_${spec.w}x${spec.h}.png`);
      }
    } catch (_) {
      // Render failed — if we have a blob, still try to save it
      if (blob) saveAs(blob, `screenshot_${spec.w}x${spec.h}.png`);
    }

    btn.disabled = false;
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────

  /** Check if focus is on an interactive input element */
  function _isFocusedOnInput() {
    const tag = document.activeElement && document.activeElement.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
           (document.activeElement && document.activeElement.isContentEditable);
  }

  document.addEventListener('keydown', (e) => {
    const editorActive = Utils.$('#step-editor').classList.contains('active');

    // Cmd/Ctrl + S → download design file
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      if (editorActive) saveDesignToFile();
      return;
    }
    // Cmd/Ctrl + O → open design file
    if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
      e.preventDefault();
      const fileIn = Utils.$('#load-file-input');
      if (fileIn) fileIn.click();
      return;
    }
    // Cmd/Ctrl + E → open export
    if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
      e.preventDefault();
      if (editorActive) openExportOverlay();
    }
    // Escape → close export overlay or new-design dropdown
    if (e.key === 'Escape') {
      const dropdown = Utils.$('#new-design-dropdown');
      if (dropdown) { dropdown.remove(); return; }
      closeExportOverlay();
    }
    // Arrow keys to switch slides — only when not focused on input elements
    if (_isFocusedOnInput()) return;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      if (editorActive && State.slides.length > 1) {
        const next = (State.activeSlideIndex + 1) % State.slides.length;
        if (next !== State.activeSlideIndex) {
          State.activeSlideIndex = next;
          Utils.$$('.slide-item').forEach((el, i) => {
            el.classList.toggle('active', i === next);
            el.setAttribute('aria-selected', i === next ? 'true' : 'false');
            el.setAttribute('tabindex', i === next ? '0' : '-1');
          });
          // Focus the active slide item for roving tabindex
          const activeItem = Utils.$('.slide-item.active');
          if (activeItem) activeItem.focus();
          loadActiveSlide();
          markDirty();
        }
      }
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      if (editorActive && State.slides.length > 1) {
        const prev = (State.activeSlideIndex - 1 + State.slides.length) % State.slides.length;
        if (prev !== State.activeSlideIndex) {
          State.activeSlideIndex = prev;
          Utils.$$('.slide-item').forEach((el, i) => {
            el.classList.toggle('active', i === prev);
            el.setAttribute('aria-selected', i === prev ? 'true' : 'false');
            el.setAttribute('tabindex', i === prev ? '0' : '-1');
          });
          const activeItem = Utils.$('.slide-item.active');
          if (activeItem) activeItem.focus();
          loadActiveSlide();
          markDirty();
        }
      }
    }
  });

})();
