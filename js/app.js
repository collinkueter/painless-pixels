/**
 * Painless Pixels — App Orchestrator
 *
 * Manages global state, wires UI events to Editor/Upload/Exporter modules,
 * and drives step transitions.
 */
(function () {
  'use strict';

  // ── State ───────────────────────────────────────────────────────────────

  const State = {
    slides:            [],
    activeSlideIndex:  0,
    device:            'iphone',
    templateId:        'bold-dark',
    bgType:            'gradient',
    bgFrom:            '#0d0d0d',
    bgTo:              '#18103a',
    bgAngle:           145,
    bgSolid:           '#6366f1',
    bgSplitTop:        '#5b5fcf',
    bgSplitBottom:     '#f5f5f5',
    headline:          'Your App Headline',
    subheadline:       'The perfect description',
    headlineSize:      38,
    textColor:         '#ffffff',
  };

  // ── Boot ────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    initUploadStep();
    initEditor();
    initExportOverlay();
  });

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
    };
  }

  function transitionToEditor() {
    Utils.$('#step-upload').classList.remove('active');
    Utils.$('#step-editor').classList.add('active');

    // Give the canvas wrapper the "loaded" class for animation
    setTimeout(() => {
      Utils.$('#canvas-wrapper').classList.add('loaded');
      const firstInput = Utils.$('#headline-input');
      if (firstInput) firstInput.focus();
    }, 50);

    renderSlideList();
    loadActiveSlide();
    applyCurrentTemplate();
    updateExportCounts();
  }

  // ── Template ─────────────────────────────────────────────────────────

  function onTemplateSelect(id) {
    State.templateId = id;
    const tmpl = Templates.getById(id);

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
  }

  function applyCurrentTemplate() {
    Editor.applyTemplate(State.templateId, true); // skip internal renderAll
    Editor.updateText({                           // this one calls renderAll
      headline:    State.headline,
      subheadline: State.subheadline,
      headlineSize: State.headlineSize,
      textColor:   State.textColor,
    });
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
    const hlInput   = Utils.$('#headline-input');
    const slInput   = Utils.$('#subheadline-input');
    const sizeInput = Utils.$('#headline-size');
    const colorEl   = Utils.$('#text-color');
    const hexLabel  = Utils.$('#text-color-hex');

    // Set initial values
    hlInput.value   = State.headline;
    slInput.value   = State.subheadline;
    sizeInput.value = State.headlineSize;
    colorEl.value   = State.textColor;

    const debouncedUpdate = Utils.debounce(() => {
      Editor.updateText({
        headline:    State.headline,
        subheadline: State.subheadline,
        headlineSize: State.headlineSize,
        textColor:   State.textColor,
      });
    }, 150);

    hlInput.addEventListener('input', () => {
      State.headline = hlInput.value;
      debouncedUpdate();
    });

    slInput.addEventListener('input', () => {
      State.subheadline = slInput.value;
      debouncedUpdate();
    });

    sizeInput.addEventListener('input', () => {
      State.headlineSize = parseInt(sizeInput.value, 10) || 38;
      debouncedUpdate();
    });

    colorEl.addEventListener('input', () => {
      State.textColor = colorEl.value;
      hexLabel.textContent = colorEl.value;
      debouncedUpdate();
    });
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
    debouncedBgUpdate();
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
  }

  function openExportOverlay() {
    updateExportCounts();
    Utils.show(Utils.$('#export-overlay'));
    Utils.$('#export-progress-wrap').classList.add('hidden');
    Utils.show(Utils.$('#export-cta'));
    // Move focus into the overlay for keyboard users
    setTimeout(() => {
      const firstBtn = Utils.$('#do-export-btn');
      if (firstBtn) firstBtn.focus();
    }, 50);
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

  document.addEventListener('keydown', (e) => {
    // Cmd/Ctrl + E → open export
    if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
      e.preventDefault();
      const editorActive = Utils.$('#step-editor').classList.contains('active');
      if (editorActive) openExportOverlay();
    }
    // Escape → close export
    if (e.key === 'Escape') closeExportOverlay();
    // Arrow keys to switch slides
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      if (Utils.$('#step-editor').classList.contains('active')) {
        const next = (State.activeSlideIndex + 1) % State.slides.length;
        if (next !== State.activeSlideIndex) {
          State.activeSlideIndex = next;
          Utils.$$('.slide-item').forEach((el, i) => {
            el.classList.toggle('active', i === next);
            el.setAttribute('aria-selected', i === next ? 'true' : 'false');
            el.setAttribute('tabindex', i === next ? '0' : '-1');
          });
          loadActiveSlide();
        }
      }
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      if (Utils.$('#step-editor').classList.contains('active')) {
        const prev = (State.activeSlideIndex - 1 + State.slides.length) % State.slides.length;
        if (prev !== State.activeSlideIndex) {
          State.activeSlideIndex = prev;
          Utils.$$('.slide-item').forEach((el, i) => {
            el.classList.toggle('active', i === prev);
            el.setAttribute('aria-selected', i === prev ? 'true' : 'false');
            el.setAttribute('tabindex', i === prev ? '0' : '-1');
          });
          loadActiveSlide();
        }
      }
    }
  });

})();
