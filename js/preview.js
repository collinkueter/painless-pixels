/**
 * Painless Pixels — Preview All Gallery
 *
 * Renders every slide at editor-canvas resolution and displays them
 * side-by-side in a full-screen overlay so users can review the full
 * sequence before exporting.
 */
const Previewer = {

  _objectURLs: [],

  /**
   * Open the preview overlay and render all slides.
   *
   * @param {Object} state        — global State object
   * @param {Object} textState    — from Editor.getTextState()
   * @param {Object} layoutState  — from getLayoutOverrides()
   */
  async open(state, textState, layoutState) {
    const overlay = document.getElementById('preview-overlay');
    const strip   = document.getElementById('preview-strip');
    const sub     = document.getElementById('preview-sub');

    Utils.show(overlay);
    strip.innerHTML = '<div class="preview-loading">Rendering previews\u2026</div>';
    sub.textContent  = 'Rendering\u2026';

    // Preload font (same as Exporter)
    try {
      await document.fonts.load('bold 40px Syne');
      await document.fonts.load('normal 40px Syne');
    } catch (_) {}

    const device   = state.activeDevice || 'iphone';
    const preview  = Devices.PREVIEW[device];
    const spec     = { w: preview.w, h: preview.h };
    const tmpl     = Templates.getById(state.templateId);
    const frameImg = await Exporter._loadImage(Devices.FRAME_PATH[device]).catch(() => null);

    const bgState = {
      bgType:        state.bgType,
      bgFrom:        state.bgFrom,
      bgTo:          state.bgTo,
      bgAngle:       state.bgAngle,
      bgSolid:       state.bgSolid,
      bgSplitTop:    state.bgSplitTop,
      bgSplitBottom: state.bgSplitBottom,
    };

    // Revoke any previous object URLs
    this._objectURLs.forEach(u => URL.revokeObjectURL(u));
    this._objectURLs = [];

    strip.innerHTML = '';
    sub.textContent = `${state.slides.length} slide${state.slides.length !== 1 ? 's' : ''}`;

    for (const [i, slide] of state.slides.entries()) {
      const screenshotImg = await Exporter._loadImage(PP.getSlideImageForDevice(slide, device)).catch(() => null);
      const blob = await Exporter._renderSlide({
        spec, device, tmpl, bgState, textState, layoutState: layoutState || {},
        screenshotImg, frameImg,
      });

      if (!blob) continue;

      const url = URL.createObjectURL(blob);
      this._objectURLs.push(url);

      const item = document.createElement('div');
      item.className = 'preview-item';

      const img = document.createElement('img');
      img.src    = url;
      img.width  = spec.w;
      img.height = spec.h;
      img.alt    = `Slide ${i + 1}`;

      const label = document.createElement('div');
      label.className   = 'preview-item-label';
      label.textContent = `${i + 1}`;

      item.appendChild(img);
      item.appendChild(label);
      strip.appendChild(item);
    }
  },

  close() {
    Utils.hide(document.getElementById('preview-overlay'));
    this._objectURLs.forEach(u => URL.revokeObjectURL(u));
    this._objectURLs = [];
  },
};
