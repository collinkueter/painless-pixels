/**
 * Painless Pixels — Upload module
 * Handles drag-drop and file-input based screenshot loading.
 */
const Upload = {

  /**
   * Wire up a drag-drop zone and hidden file input.
   *
   * @param {HTMLElement}  zoneEl       The clickable/droppable zone element
   * @param {HTMLInputElement} inputEl  Hidden <input type="file">
   * @param {Function}     onLoad       Callback(slides: Slide[])
   */
  init(zoneEl, inputEl, onLoad) {
    // ── Drag events ──────────────────────────────────────────
    zoneEl.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      zoneEl.classList.add('drag-over');
    });

    zoneEl.addEventListener('dragleave', e => {
      if (!zoneEl.contains(e.relatedTarget)) {
        zoneEl.classList.remove('drag-over');
      }
    });

    zoneEl.addEventListener('drop', e => {
      e.preventDefault();
      zoneEl.classList.remove('drag-over');
      const files = this._filterImages(Array.from(e.dataTransfer.files));
      if (files.length) this._processFiles(files, onLoad).catch(() => {});
    });

    // ── Click to browse ──────────────────────────────────────
    zoneEl.addEventListener('click', () => inputEl.click());

    inputEl.addEventListener('change', e => {
      const files = this._filterImages(Array.from(e.target.files));
      if (files.length) this._processFiles(files, onLoad).catch(() => {});
      inputEl.value = '';   // allow re-uploading same file
    });
  },

  /**
   * Process a list of File objects → Slide objects, then call onLoad.
   */
  async _processFiles(files, onLoad) {
    const batch = files.slice(0, 10);
    const slides = [];
    for (const file of batch) {
      try {
        const imageData = await Utils.loadFileAsDataURL(file);
        slides.push({
          id:        Utils.uid(),
          file,
          imageData,
          title:     file.name.replace(/\.[^.]+$/, ''),
        });
      } catch (_) {
        // Skip files that fail to load (corrupt, unsupported format, etc.)
      }
    }
    if (slides.length && onLoad) onLoad(slides);
  },

  /**
   * Turn a list of File objects into Slide objects (used for "add more").
   * Returns a Promise<Slide[]>.
   */
  async filesToSlides(files) {
    const batch = this._filterImages(Array.from(files)).slice(0, 10);
    const slides = [];
    for (const file of batch) {
      try {
        const imageData = await Utils.loadFileAsDataURL(file);
        slides.push({
          id:        Utils.uid(),
          file,
          imageData,
          title:     file.name.replace(/\.[^.]+$/, ''),
        });
      } catch (_) {
        // Skip files that fail to load
      }
    }
    return slides;
  },

  _filterImages(files) {
    return files.filter(f => f.type.startsWith('image/'));
  },
};
