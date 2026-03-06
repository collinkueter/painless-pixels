/**
 * Painless Pixels — Fabric.js Editor
 *
 * Layer order (bottom → top):
 *   0  bgRect         — solid or gradient background fill
 *   1  splitRect      — lower half fill for "split" templates
 *   2  phoneImage     — user's screenshot, clipped to device screen area
 *   3  frameImage     — device frame SVG overlay (transparent screen hole)
 *   4  headlineText   — editable headline
 *   5  sublineText    — editable subheadline
 */
const Editor = {

  canvas:       null,
  bgRect:       null,
  splitRect:    null,
  phoneImage:   null,
  frameImage:   null,
  headlineText: null,
  sublineText:  null,

  currentDevice:   'iphone',
  currentTemplate: null,
  currentSlide:    null,

  _loadSeq:      0,
  _onTextChange: null,

  // ── Initialise ────────────────────────────────────────────────────────────

  init(canvasEl) {
    const preview = Devices.PREVIEW['iphone'];
    this.canvas = new fabric.Canvas(canvasEl, {
      width:                   preview.w,
      height:                  preview.h,
      selection:               false,
      preserveObjectStacking:  true,
      renderOnAddRemove:       false,
    });

    this._buildStaticLayers();
    this.canvas.renderAll();

    // Show the device frame immediately even without a screenshot
    this._loadFrame();

    return this;
  },

  _buildStaticLayers() {
    const c = this.canvas;
    const w = c.width, h = c.height;

    // Background
    this.bgRect = new fabric.Rect({
      width: w, height: h, left: 0, top: 0,
      fill: '#0d0d0d',
      selectable: false, evented: false,
      name: 'bg',
    });
    c.add(this.bgRect);

    // Split lower half (hidden by default)
    this.splitRect = new fabric.Rect({
      width: w, height: h / 2, left: 0, top: h / 2,
      fill: '#f5f5f5',
      selectable: false, evented: false,
      visible: false,
      name: 'split',
    });
    c.add(this.splitRect);

    // Headline text
    this.headlineText = new fabric.IText('Your App Headline', {
      left: w / 2, top: h * 0.85,
      originX: 'center', originY: 'center',
      fontSize:   Math.round(h * 0.048),
      fontFamily: 'Syne, system-ui, sans-serif',
      fontWeight: 'bold',
      fill:       '#ffffff',
      textAlign:  'center',
      selectable: true,
      editable:   true,
      name:       'headline',
      lockScalingFlip: true,
    });
    c.add(this.headlineText);
    this.headlineText.on('changed', () => {
      if (this._onTextChange) this._onTextChange('headline', this.headlineText.text);
    });

    // Subheadline text
    this.sublineText = new fabric.IText('The perfect description for your app', {
      left: w / 2, top: h * 0.920,
      originX: 'center', originY: 'center',
      fontSize:   Math.round(h * 0.025),
      fontFamily: 'Syne, system-ui, sans-serif',
      fontWeight: 'normal',
      fill:       '#8888aa',
      textAlign:  'center',
      selectable: true,
      editable:   true,
      name:       'subline',
      lockScalingFlip: true,
    });
    c.add(this.sublineText);
    this.sublineText.on('changed', () => {
      if (this._onTextChange) this._onTextChange('subheadline', this.sublineText.text);
    });
  },

  // ── Device Switch ─────────────────────────────────────────────────────────

  switchDevice(device) {
    this.currentDevice = device;
    const p = Devices.PREVIEW[device];

    // Resize canvas
    this.canvas.setWidth(p.w);
    this.canvas.setHeight(p.h);

    // Resize background rects
    this.bgRect.set({ width: p.w, height: p.h });
    this.splitRect.set({ width: p.w, height: p.h / 2, top: p.h / 2 });

    // Reload content
    if (this.currentSlide) this.loadSlide(this.currentSlide);
    else this._loadFrame();

    // Layout is applied inside the async _loadFrame / loadSlide callbacks
    this.canvas.renderAll();
  },

  // ── Slide Loading ─────────────────────────────────────────────────────────

  loadSlide(slide) {
    this.currentSlide = slide;
    const c = this.canvas;
    const device = this.currentDevice;
    const screen = Devices.screenInPreview(device);
    const seq = ++this._loadSeq;

    // Remove old phone image
    if (this.phoneImage) { this.phoneImage.dispose(); c.remove(this.phoneImage); this.phoneImage = null; }

    fabric.Image.fromURL(
      slide.imageData,
      (img) => {
        if (this._loadSeq !== seq) return;
        if (!img) return;

        // Scale screenshot to cover the screen area
        const scaleX = screen.w / img.width;
        const scaleY = screen.h / img.height;
        const scale  = Math.max(scaleX, scaleY);   // cover

        img.set({
          left:      screen.x + screen.w / 2,
          top:       screen.y + screen.h / 2,
          originX:   'center',
          originY:   'center',
          scaleX:    scale,
          scaleY:    scale,
          selectable: false,
          evented:    false,
          name:       'screenshot',
          clipPath:   new fabric.Rect({
            width:             screen.w,
            height:            screen.h,
            left:              screen.x,
            top:               screen.y,
            absolutePositioned: true,
          }),
        });

        this.phoneImage = img;
        c.add(img);
        this._reorderLayers();

        this._loadFrame();   // will reapply layout once frame is ready
        c.renderAll();
      },
      { crossOrigin: 'anonymous' }
    );
  },

  _loadFrame() {
    const c = this.canvas;
    const device = this.currentDevice;

    if (this.frameImage) { this.frameImage.dispose(); c.remove(this.frameImage); this.frameImage = null; }

    fabric.Image.fromURL(
      Devices.FRAME_PATH[device],
      (img) => {
        if (!img) return;
        // Initial positioning — will be overridden by _applyLayout below
        img.set({
          left:      c.width  / 2,
          top:       c.height / 2,
          originX:   'center',
          originY:   'center',
          scaleX:    c.width  / img.width,
          scaleY:    c.height / img.height,
          selectable: false,
          evented:    false,
          name:       'frame',
        });

        this.frameImage = img;
        c.add(img);
        this._reorderLayers();

        // Reapply layout now that frame is loaded
        if (this.currentTemplate) this._applyLayout(this.currentTemplate);
        c.renderAll();
      }
      // Note: no crossOrigin for local SVG files
    );
  },

  /** Ensure correct z-order: bg → split → phone → frame → headline → subline */
  _reorderLayers() {
    const c = this.canvas;
    // sendObjectToBack puts item at index 0, pushing others up
    // Call in REVERSE of desired bottom-up order so bgRect ends at the bottom
    if (this.frameImage)   c.sendObjectToBack(this.frameImage);
    if (this.phoneImage)   c.sendObjectToBack(this.phoneImage);
    if (this.splitRect)    c.sendObjectToBack(this.splitRect);
    if (this.bgRect)       c.sendObjectToBack(this.bgRect);
    // Text always on top
    if (this.headlineText) c.bringObjectToFront(this.headlineText);
    if (this.sublineText)  c.bringObjectToFront(this.sublineText);
  },

  // ── Template Application ──────────────────────────────────────────────────

  applyTemplate(templateId, skipRender = false) {
    const tmpl = Templates.getById(templateId);
    this.currentTemplate = tmpl;

    this._applyBackground(tmpl);
    this._applyLayout(tmpl);

    this.canvas.bringObjectToFront(this.headlineText);
    this.canvas.bringObjectToFront(this.sublineText);
    if (!skipRender) this.canvas.renderAll();
  },

  _applyBackground(tmpl) {
    const c = this.canvas;
    const w = c.width, h = c.height;
    const bg = tmpl.bg;

    if (bg.type === 'split') {
      this.bgRect.set('fill', bg.top);
      this.splitRect.set({ visible: true, fill: bg.bottom });
    } else {
      this.splitRect.set('visible', false);
      if (bg.type === 'gradient') {
        this.bgRect.set('fill', this._makeGradient(bg.from, bg.to, bg.angle, w, h));
      } else {
        this.bgRect.set('fill', bg.color);
      }
    }

    c.sendObjectToBack(this.splitRect);
    c.sendObjectToBack(this.bgRect);
  },

  _applyLayout(tmpl) {
    const c  = this.canvas;
    const w  = c.width;
    const h  = c.height;

    // ── Position phone & its clip ──────────────────────────────────────────
    if (this.phoneImage) {
      const phoneCX = w * tmpl.phoneXFrac;
      const phoneCY = h * tmpl.phoneYFrac;
      const design  = Devices.DESIGN[this.currentDevice];
      const phonePixelScale = (w * tmpl.phoneScale) / design.w;
      const screen = Devices.screenForPhone(
        this.currentDevice, phoneCX, phoneCY, phonePixelScale
      );

      // Cover scale for screenshot
      const scaleX = screen.w / this.phoneImage.width;
      const scaleY = screen.h / this.phoneImage.height;
      const scale  = Math.max(scaleX, scaleY);

      this.phoneImage.set({
        left:   screen.x + screen.w / 2,
        top:    screen.y + screen.h / 2,
        scaleX: scale,
        scaleY: scale,
        clipPath: new fabric.Rect({
          width:              screen.w,
          height:             screen.h,
          left:               screen.x,
          top:                screen.y,
          absolutePositioned: true,
        }),
      });

      // Scale and position frame to match phone position
      if (this.frameImage) {
        const frameNatW = this.frameImage.width;
        const frameNatH = this.frameImage.height;
        const frameTargW = w * tmpl.phoneScale;
        const frameTargH = frameTargW * (frameNatH / frameNatW);
        this.frameImage.set({
          left:   phoneCX,
          top:    phoneCY,
          originX: 'center',
          originY: 'center',
          scaleX:  frameTargW / frameNatW,
          scaleY:  frameTargH / frameNatH,
        });
      }
    } else if (this.frameImage) {
      // No screenshot yet, still position frame
      const frameNatW = this.frameImage.width;
      const frameNatH = this.frameImage.height;
      const frameTargW = w * tmpl.phoneScale;
      const frameTargH = frameTargW * (frameNatH / frameNatW);
      this.frameImage.set({
        left:   w * tmpl.phoneXFrac,
        top:    h * tmpl.phoneYFrac,
        originX: 'center',
        originY: 'center',
        scaleX:  frameTargW / frameNatW,
        scaleY:  frameTargH / frameNatH,
      });
    }

    // ── Position text ──────────────────────────────────────────────────────
    const hl = tmpl.headline;
    const sl = tmpl.subheadline;

    this.headlineText.set({
      left:       w * hl.xFrac,
      top:        h * hl.yFrac,
      originX:    hl.align === 'left' ? 'left' : 'center',
      originY:    'center',
      textAlign:  hl.align,
      fontSize:   Math.round(h * hl.sizeFrac),
      fill:       hl.color,
      fontWeight: hl.weight,
    });

    this.sublineText.set({
      left:       w * sl.xFrac,
      top:        h * sl.yFrac,
      originX:    sl.align === 'left' ? 'left' : 'center',
      originY:    'center',
      textAlign:  sl.align,
      fontSize:   Math.round(h * sl.sizeFrac),
      fill:       sl.color,
      fontWeight: sl.weight,
    });
  },

  // ── Background Update (from sidebar controls) ─────────────────────────────

  updateBackground(state) {
    const c = this.canvas;
    const w = c.width, h = c.height;

    if (state.bgType === 'split') {
      // used internally by templates
      this.bgRect.set('fill', state.bgSplitTop || '#5b5fcf');
      this.splitRect.set({ visible: true, fill: state.bgSplitBottom || '#f5f5f5' });
    } else {
      this.splitRect.set('visible', false);
      if (state.bgType === 'gradient') {
        this.bgRect.set('fill', this._makeGradient(
          state.bgFrom, state.bgTo, state.bgAngle, w, h
        ));
      } else {
        this.bgRect.set('fill', state.bgSolid);
      }
    }

    c.sendObjectToBack(this.splitRect);
    c.sendObjectToBack(this.bgRect);
    c.renderAll();
  },

  // ── Text Update ────────────────────────────────────────────────────────────

  updateText(state) {
    if ('headline' in state)     this.headlineText.set('text', state.headline);
    if ('subheadline' in state)  this.sublineText.set('text', state.subheadline);
    if ('headlineSize' in state) this.headlineText.set('fontSize', parseInt(state.headlineSize, 10) || 38);
    if ('textColor' in state) {
      this.headlineText.set('fill', state.textColor);
    }
    this.canvas.renderAll();
  },

  // ── Helpers ────────────────────────────────────────────────────────────────

  _makeGradient(from, to, angle, w, h) {
    const coords = Utils.angleToCoords(angle, w, h);
    return new fabric.Gradient({
      type:          'linear',
      gradientUnits: 'pixels',
      coords,
      colorStops: [
        { offset: 0, color: from },
        { offset: 1, color: to   },
      ],
    });
  },

  /** Export the current canvas as a data URL */
  toDataURL() {
    return this.canvas.toDataURL({ format: 'png', multiplier: 1 });
  },

  /** Get text values for export */
  getTextState() {
    return {
      headline:    this.headlineText.text,
      subheadline: this.sublineText.text,
      hlFontSize:  this.headlineText.fontSize,
      hlColor:     this.headlineText.fill,
      hlWeight:    this.headlineText.fontWeight,
      hlAlign:     this.headlineText.textAlign,
      slFontSize:  this.sublineText.fontSize,
      slColor:     this.sublineText.fill,
      slWeight:    this.sublineText.fontWeight,
      slAlign:     this.sublineText.textAlign,
    };
  },
};
