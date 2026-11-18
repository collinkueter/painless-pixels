/**
 * Painless Pixels — Image Bucket Module
 *
 * Manages the Image Library panel in the right sidebar.
 * Each device has its own "bucket" of uploaded screenshots.
 * Clicking a bucket thumbnail assigns it to the active slide for that device.
 */
PP.Buckets = (function () {
  'use strict';

  var DEVICES = [
    { key: 'iphone',        label: 'iPhone' },
    { key: 'ipad',          label: 'iPad' },
    { key: 'android-phone', label: 'Android Phone' },
    { key: 'android-7',     label: 'Android 7"' },
    { key: 'android-10',    label: 'Android 10"' },
  ];

  var MAX_BUCKET_IMAGES = 30; // per device

  var _collapsed = {};
  // Restore collapsed state across sessions
  try {
    var _saved = localStorage.getItem('pp-bucket-collapsed');
    if (_saved) _collapsed = JSON.parse(_saved);
  } catch (_) {}

  // ── Public API ─────────────────────────────────────────────────────────

  function addToBucket(device, entry) {
    var S = PP.State;
    if (!S.buckets[device]) S.buckets[device] = [];
    if (S.buckets[device].length >= MAX_BUCKET_IMAGES) return; // enforce per-device cap
    S.buckets[device].push(entry);
    render();
    PP.markDirty();
  }

  function removeFromBucket(device, id) {
    var S = PP.State;
    if (!S.buckets[device]) return;
    S.buckets[device] = S.buckets[device].filter(function (e) { return e.id !== id; });
    // Clear all slide assignments pointing to this image
    S.slides.forEach(function (slide) {
      if (slide.deviceImages && slide.deviceImages[device] === id) {
        slide.deviceImages[device] = null;
      }
    });
    render();
    PP.renderSlideList();
    PP.markDirty();
  }

  function assignToActiveSlide(device, id) {
    var S = PP.State;
    var slide = S.slides[S.activeSlideIndex];
    if (!slide) return;

    if (!slide.deviceImages) {
      slide.deviceImages = { iphone: null, ipad: null, 'android-phone': null, 'android-7': null, 'android-10': null };
    }

    // Toggle: if already assigned to this id, deassign
    if (slide.deviceImages[device] === id) {
      slide.deviceImages[device] = null;
    } else {
      slide.deviceImages[device] = id;
    }

    // Reload canvas if assignment device matches active device
    if (device === S.activeDevice) {
      PP.loadActiveSlide();
    }

    render();
    PP.renderSlideList();
    PP.markDirty();
  }

  function render() {
    var S = PP.State;
    var container = Utils.$('#buckets-list');
    if (!container) return;

    container.innerHTML = '';

    DEVICES.forEach(function (devCfg) {
      var device = devCfg.key;
      var entries = (S.buckets && S.buckets[device]) ? S.buckets[device] : [];
      var isCollapsed = !!_collapsed[device];

      var section = document.createElement('div');
      section.className = 'bucket-section';

      // ── Header ─────────────────────────────────────────────────────────
      var header = document.createElement('div');
      header.className = 'bucket-section-header';
      header.setAttribute('role', 'button');
      header.setAttribute('tabindex', '0');
      header.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
      header.setAttribute('aria-label', devCfg.label + ' image bucket');

      var chevronWrap = document.createElement('span');
      chevronWrap.className = 'bucket-chevron' + (isCollapsed ? ' is-collapsed' : '');
      chevronWrap.innerHTML =
        '<svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">' +
        '<path d="M2 3L4 5L6 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>';

      var titleEl = document.createElement('span');
      titleEl.className = 'bucket-title';
      titleEl.textContent = devCfg.label + ' (' + entries.length + ')';

      var addBtn = document.createElement('button');
      addBtn.className = 'bucket-add-btn';
      addBtn.setAttribute('aria-label', 'Add image to ' + devCfg.label);
      addBtn.title = 'Upload to ' + devCfg.label;
      addBtn.innerHTML =
        '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">' +
        '<path d="M5 1V9M1 5H9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>' +
        '</svg>';

      // Hidden file input for this device bucket
      var fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.multiple = true;
      fileInput.hidden = true;
      fileInput.addEventListener('change', (function (dev) {
        return async function (e) {
          e.target.value = '';
          var files = Upload._filterImages(Array.from(e.target.files));
          if (!files.length) return;
          try {
            var images = await Upload.filesToImages(files);
            images.forEach(function (img) { addToBucket(dev, img); });
          } catch (_) { /* ignore upload errors silently */ }
        };
      })(device));

      addBtn.addEventListener('click', (function (inp) {
        return function (e) {
          e.stopPropagation();
          inp.click();
        };
      })(fileInput));

      header.appendChild(chevronWrap);
      header.appendChild(titleEl);
      header.appendChild(addBtn);
      header.appendChild(fileInput);

      // Toggle collapse on header click or keyboard
      var toggleCollapse = (function (dev) {
        return function (e) {
          if (e.target.closest('.bucket-add-btn')) return;
          _collapsed[dev] = !_collapsed[dev];
          try { localStorage.setItem('pp-bucket-collapsed', JSON.stringify(_collapsed)); } catch (_) {}
          render();
        };
      })(device);
      header.addEventListener('click', toggleCollapse);
      header.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCollapse(e); }
      });

      section.appendChild(header);

      // ── Body ───────────────────────────────────────────────────────────
      if (!isCollapsed) {
        var body = document.createElement('div');
        body.className = 'bucket-section-body';

        if (entries.length === 0) {
          var empty = document.createElement('div');
          empty.className = 'bucket-empty';
          empty.textContent = 'No images — click + to upload';
          body.appendChild(empty);
        } else {
          // Build assignment map: imageId → slideNumber (1-based)
          var slideAssignments = {};
          S.slides.forEach(function (slide, idx) {
            if (slide.deviceImages && slide.deviceImages[device]) {
              slideAssignments[slide.deviceImages[device]] = idx + 1;
            }
          });

          var activeSlide = S.slides[S.activeSlideIndex];
          var activeAssigned = activeSlide && activeSlide.deviceImages && activeSlide.deviceImages[device];

          var thumbsGrid = document.createElement('div');
          thumbsGrid.className = 'bucket-thumbs';
          var thumbsFrag = document.createDocumentFragment();

          entries.forEach(function (entry) {
            var isAssignedToActive = activeAssigned === entry.id;

            var wrap = document.createElement('div');
            wrap.className = 'bucket-thumb-wrap' + (isAssignedToActive ? ' assigned' : '');
            wrap.setAttribute('title', entry.title || 'Screenshot');
            wrap.setAttribute('role', 'button');
            wrap.setAttribute('tabindex', '0');
            wrap.setAttribute('aria-label',
              (isAssignedToActive ? 'Deassign' : 'Assign') + ' ' + (entry.title || 'image') + ' to active slide');

            var img = document.createElement('img');
            img.src = entry.imageData;
            img.alt = entry.title || ('Screenshot ' + (entries.indexOf(entry) + 1));
            img.className = 'bucket-thumb';

            // Slide number badge (shown for all assigned slides, not just active)
            if (slideAssignments[entry.id]) {
              var badge = document.createElement('span');
              badge.className = 'bucket-badge';
              badge.textContent = slideAssignments[entry.id];
              badge.setAttribute('aria-hidden', 'true');
              wrap.appendChild(badge);
            }

            // Remove button
            var removeBtn = document.createElement('button');
            removeBtn.className = 'bucket-thumb-remove';
            removeBtn.setAttribute('aria-label', 'Remove ' + (entry.title || 'image') + ' from bucket');
            removeBtn.innerHTML =
              '<svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">' +
              '<path d="M1.5 1.5L6.5 6.5M6.5 1.5L1.5 6.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>' +
              '</svg>';

            removeBtn.addEventListener('click', (function (dev, id) {
              return function (e) {
                e.stopPropagation();
                removeFromBucket(dev, id);
              };
            })(device, entry.id));

            wrap.appendChild(img);
            wrap.appendChild(removeBtn);

            // Click or Enter/Space to assign/deassign
            var assignHandler = (function (dev, id) {
              return function () { assignToActiveSlide(dev, id); };
            })(device, entry.id);

            wrap.addEventListener('click', assignHandler);
            wrap.addEventListener('keydown', function (e) {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                assignHandler();
              }
            });

            thumbsFrag.appendChild(wrap);
          });

          thumbsGrid.appendChild(thumbsFrag);
          body.appendChild(thumbsGrid);
        }

        section.appendChild(body);
      }

      container.appendChild(section);
    });
  }

  // ── Upload step rendering ───────────────────────────────────────────────

  /**
   * Render bucket upload zones into the step-1 upload screen.
   * Called by app.js during initUploadStep.
   */
  function renderUploadStep() {
    var container = Utils.$('#upload-buckets-grid');
    if (!container) return;
    container.innerHTML = '';

    var S = PP.State;

    DEVICES.forEach(function (devCfg) {
      var device = devCfg.key;
      var entries = (S.buckets && S.buckets[device]) ? S.buckets[device] : [];

      var section = document.createElement('div');
      section.className = 'upload-bucket-section';

      var header = document.createElement('div');
      header.className = 'upload-bucket-header';
      header.innerHTML =
        '<span class="upload-bucket-label">' + devCfg.label + '</span>' +
        '<span class="upload-bucket-count">' + (entries.length ? entries.length + ' image' + (entries.length !== 1 ? 's' : '') : '') + '</span>';

      var zone = document.createElement('div');
      zone.className = 'upload-bucket-zone' + (entries.length ? ' has-images' : '');
      zone.setAttribute('role', 'button');
      zone.setAttribute('tabindex', '0');
      zone.setAttribute('aria-label', 'Upload ' + devCfg.label + ' screenshots');

      var fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.multiple = true;
      fileInput.hidden = true;

      if (entries.length) {
        // Show thumbnails
        var thumbRow = document.createElement('div');
        thumbRow.className = 'upload-bucket-thumbs';
        entries.slice(0, 4).forEach(function (entry) {
          var img = document.createElement('img');
          img.src = entry.imageData;
          img.alt = entry.title || '';
          img.className = 'upload-bucket-thumb';
          thumbRow.appendChild(img);
        });
        if (entries.length > 4) {
          var more = document.createElement('span');
          more.className = 'upload-bucket-more';
          more.textContent = '+' + (entries.length - 4);
          thumbRow.appendChild(more);
        }
        zone.appendChild(thumbRow);
      } else {
        var addIcon = document.createElement('div');
        addIcon.className = 'upload-bucket-icon';
        addIcon.innerHTML =
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
          '<path d="M12 4V16M12 4L8 8M12 4L16 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
          '<path d="M4 20H20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
          '</svg>';
        var addLabel = document.createElement('span');
        addLabel.className = 'upload-bucket-add-label';
        addLabel.textContent = 'Drop or click';
        zone.appendChild(addIcon);
        zone.appendChild(addLabel);
      }

      // Wire drag-drop
      zone.addEventListener('dragover', function (e) {
        e.preventDefault();
        zone.classList.add('drag-over');
      });
      zone.addEventListener('dragleave', function (e) {
        if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over');
      });
      zone.addEventListener('drop', (function (dev) {
        return async function (e) {
          e.preventDefault();
          zone.classList.remove('drag-over');
          var files = Upload._filterImages(Array.from(e.dataTransfer.files));
          if (!files.length) return;
          try {
            var images = await Upload.filesToImages(files);
            images.forEach(function (img) { addToBucket(dev, img); });
            renderUploadStep();
            _updateOpenEditorBtn();
          } catch (_) { /* ignore upload errors silently */ }
        };
      })(device));

      zone.addEventListener('click', (function (inp) {
        return function () { inp.click(); };
      })(fileInput));
      zone.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
      });

      fileInput.addEventListener('change', (function (dev) {
        return async function (e) {
          e.target.value = '';
          var files = Upload._filterImages(Array.from(e.target.files));
          if (!files.length) return;
          try {
            var images = await Upload.filesToImages(files);
            images.forEach(function (img) { addToBucket(dev, img); });
            renderUploadStep();
            _updateOpenEditorBtn();
          } catch (_) { /* ignore upload errors silently */ }
        };
      })(device));

      section.appendChild(header);
      section.appendChild(zone);
      section.appendChild(fileInput);
      container.appendChild(section);
    });
  }

  function _updateOpenEditorBtn() {
    var btn = Utils.$('#open-editor-btn');
    if (!btn) return;
    var S = PP.State;
    var hasAny = DEVICES.some(function (d) {
      return S.buckets[d.key] && S.buckets[d.key].length > 0;
    });
    btn.disabled = false; // always enabled — skippable
    if (hasAny) {
      btn.classList.add('has-images');
    } else {
      btn.classList.remove('has-images');
    }
  }

  // ── Public ─────────────────────────────────────────────────────────────

  return {
    render:             render,
    renderUploadStep:   renderUploadStep,
    addToBucket:        addToBucket,
    removeFromBucket:   removeFromBucket,
    assignToActiveSlide: assignToActiveSlide,
  };

})();
