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
    iphone:           { w: 323, h: 660 },  // 390×797 scaled to fit
    ipad:             { w: 450, h: 583 },  // 1024×1327 scaled to fit
    'android-phone':  { w: 318, h: 660 },  // 396×822 frame AR, scaled to h=660
    'android-7':      { w: 460, h: 300 },  // 943×616 frame AR (landscape tablet)
    'android-10':     { w: 460, h: 300 },  // 943×616 frame AR (landscape tablet)
  },

  // Full design dimensions (match frame aspect ratios)
  DESIGN: {
    iphone:           { w: 390,  h: 797  },  // matches 1350×2760 frame AR
    ipad:             { w: 1024, h: 1327 },  // matches 2300×2980 frame AR
    'android-phone':  { w: 396,  h: 822  },  // matches galaxy_phone_frame_cropped AR
    'android-7':      { w: 943,  h: 616  },  // matches galaxy_tablet_frame_cropped AR
    'android-10':     { w: 943,  h: 616  },  // matches galaxy_tablet_frame_cropped AR
  },

  // Where the screen sits inside the device frame (fractions of frame dims)
  // Measured from transparent screen cutout in cropped frame PNGs
  SCREEN_FRACS: {
    iphone:           { x: 0.0533, y: 0.0250, w: 0.8933, h: 0.9500 },
    ipad:             { x: 0.0548, y: 0.0416, w: 0.8904, h: 0.9168 },
    'android-phone':  { x: 0.0404, y: 0.0195, w: 0.9192, h: 0.9623 },
    'android-7':      { x: 0.0350, y: 0.0568, w: 0.9300, h: 0.8896 },
    'android-10':     { x: 0.0350, y: 0.0568, w: 0.9300, h: 0.8896 },
  },

  // Screen corner radius as fraction of screen width (measured from frame PNGs)
  SCREEN_CORNER: {
    iphone:           0.070,
    ipad:             0.017,
    'android-phone':  0.040,
    'android-7':      0.025,
    'android-10':     0.025,
  },

  // Device frame image paths
  FRAME_PATH: {
    iphone:           'assets/frames/iphone.png',
    ipad:             'assets/frames/ipad.png',
    'android-phone':  'assets/frames/galaxy_phone_frame_cropped.png',
    'android-7':      'assets/frames/galaxy_tablet_frame_cropped.png',
    'android-10':     'assets/frames/galaxy_tablet_frame_cropped.png',
  },

  // Export specifications keyed by device type
  EXPORT_SPECS: {
    iphone: [
      { path: 'ios/iphone_1260x2736',   w: 1260, h: 2736, label: 'iPhone 6.9"' },
      { path: 'ios/iphone_1284x2778',   w: 1284, h: 2778, label: 'iPhone 6.5"' },
    ],
    ipad: [
      { path: 'ios/ipad_2064x2752',     w: 2064, h: 2752, label: 'iPad 13"' },
      { path: 'ios/ipad_2048x2732',     w: 2048, h: 2732, label: 'iPad 12.9"' },
    ],
    'android-phone': [
      { path: 'android/phone_1080x1920',  w: 1080, h: 1920, label: 'Phone Portrait' },
      { path: 'android/phone_1920x1080',  w: 1920, h: 1080, label: 'Phone Landscape' },
    ],
    'android-7': [
      { path: 'android/tablet7_1200x1920', w: 1200, h: 1920, label: 'Tablet 7"' },
    ],
    'android-10': [
      { path: 'android/tablet10_1800x2560', w: 1800, h: 2560, label: 'Tablet 10"' },
    ],
  },

  // OS → device mapping
  OS_DEVICES: {
    ios:     ['iphone', 'ipad'],
    android: ['android-phone', 'android-7', 'android-10'],
  },

  // Human-readable labels
  DEVICE_LABELS: {
    iphone:          'iPhone',
    ipad:            'iPad',
    'android-phone': 'Phone',
    'android-7':     'Tablet 7"',
    'android-10':    'Tablet 10"',
  },

  // All device keys
  ALL_DEVICES: ['iphone', 'ipad', 'android-phone', 'android-7', 'android-10'],

  // Form factor mapping
  FORM_FACTOR: {
    iphone:          'phone',
    ipad:            'tablet',
    'android-phone': 'phone',
    'android-7':     'tablet',
    'android-10':    'tablet',
  },

  FORM_DEVICES: {
    phone:  ['iphone', 'android-phone'],
    tablet: ['ipad', 'android-7', 'android-10'],
  },

  isTablet(device) {
    return this.FORM_FACTOR[device] === 'tablet';
  },

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

  /**
   * Which OS does a device belong to?
   */
  osForDevice(device) {
    for (var os in this.OS_DEVICES) {
      if (this.OS_DEVICES[os].indexOf(device) !== -1) return os;
    }
    return 'ios';
  },
};
