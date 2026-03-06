/**
 * Painless Pixels — Device specifications
 *
 * PREVIEW:  Fabric.js canvas pixel dimensions (the live editor)
 * DESIGN:   Logical design dimensions (what we scale from for export)
 * SCREEN_FRACS: position of the device screen within the design area, as fractions 0→1
 */
const Devices = {

  // Preview canvas sizes (pixels) — same aspect ratio as DESIGN
  PREVIEW: {
    iphone:  { w: 323, h: 700 },  // 390×845 scaled: 700/845 = 0.8284
    ipad:    { w: 450, h: 600 },  // 1024×1366 scaled: 600/1366 = 0.4392
    android: { w: 315, h: 700 },  // 412×915 scaled: 700/915 = 0.7650
  },

  // Full design dimensions
  DESIGN: {
    iphone:  { w: 390,  h: 845  },
    ipad:    { w: 1024, h: 1366 },
    android: { w: 412,  h: 915  },
  },

  // Where the screen sits inside the device frame (fractions of design dims)
  // These match the SVG viewBox cutouts in assets/frames/
  SCREEN_FRACS: {
    iphone:  { x: 0.038, y: 0.026, w: 0.923, h: 0.911 },
    ipad:    { x: 0.045, y: 0.038, w: 0.910, h: 0.893 },
    android: { x: 0.029, y: 0.044, w: 0.942, h: 0.912 },
  },

  // Device frame SVG paths
  FRAME_PATH: {
    iphone:  'assets/frames/iphone-16-pro.svg',
    ipad:    'assets/frames/ipad-13.svg',
    android: 'assets/frames/android-pixel.svg',
  },

  // Export specifications — ALL sizes for a given slide set
  EXPORT_SPECS: [
    { path: 'ios/iphone_1260x2736',        w: 1260, h: 2736, label: 'iPhone 6.9"'       },
    { path: 'ios/iphone_1284x2778',        w: 1284, h: 2778, label: 'iPhone 6.5"'       },
    { path: 'ios/ipad_2064x2752',          w: 2064, h: 2752, label: 'iPad 13"'          },
    { path: 'ios/ipad_2048x2732',          w: 2048, h: 2732, label: 'iPad 12.9"'        },
    { path: 'android/phone_1080x1920',     w: 1080, h: 1920, label: 'Android Phone'     },
    { path: 'android/phone_1920x1080',     w: 1920, h: 1080, label: 'Android Landscape' },
    { path: 'android/tablet7_1200x1920',   w: 1200, h: 1920, label: 'Android Tablet 7"' },
    { path: 'android/tablet10_1800x2560',  w: 1800, h: 2560, label: 'Android Tablet 10"'},
  ],

  /**
   * Scale factor: preview → design
   */
  previewToDesignScale(device) {
    return this.DESIGN[device].w / this.PREVIEW[device].w;
  },

  /**
   * Screen rectangle in preview pixels
   */
  screenInPreview(device) {
    return this._screenAt(device, this.PREVIEW[device].w, this.PREVIEW[device].h);
  },

  /**
   * Screen rectangle at an arbitrary canvas size
   */
  screenAt(device, canvasW, canvasH) {
    return this._screenAt(device, canvasW, canvasH);
  },

  _screenAt(device, W, H) {
    const f = this.SCREEN_FRACS[device];
    return { x: f.x * W, y: f.y * H, w: f.w * W, h: f.h * H };
  },

  /**
   * Given a phone center position and a display scale (preview px per design px),
   * compute the screen rectangle for that phone position.
   *
   * phoneCenterX/Y: center of the phone on the canvas in preview pixels
   * displayScale:   preview.w / design.w  (same as previewToDesignScale inverted)
   */
  screenForPhone(device, phoneCenterX, phoneCenterY, displayScale) {
    const design = this.DESIGN[device];
    const fracs  = this.SCREEN_FRACS[device];
    const dw = design.w * displayScale;  // phone display width in canvas pixels
    const dh = design.h * displayScale;
    const phoneLeft = phoneCenterX - dw / 2;
    const phoneTop  = phoneCenterY - dh / 2;
    return {
      x: phoneLeft + fracs.x * dw,
      y: phoneTop  + fracs.y * dh,
      w: fracs.w * dw,
      h: fracs.h * dh,
    };
  },
};
