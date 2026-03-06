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
  _layoutOverrides: null,

  _loadSeq:        0,
  _onTextChange:   null,
  _onLayoutChange: null,

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
    this._wireInteraction();
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
      lockScalingX: true,
      lockScalingY: true,
      hasControls: true,
      hasBorders: true,
    });
    this.headlineText.setControlsVisibility({
      ml: false, mr: false, mt: false, mb: false,
      tl: false, tr: false, bl: false, br: false,
      mtr: true,
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
      lockScalingX: true,
      lockScalingY: true,
      hasControls: true,
      hasBorders: true,
    });
    this.sublineText.setControlsVisibility({
      ml: false, mr: false, mt: false, mb: false,
      tl: false, tr: false, bl: false, br: false,
      mtr: true,
    });
    c.add(this.sublineText);
    this.sublineText.on('changed', () => {
      if (this._onTextChange) this._onTextChange('subheadline', this.sublineText.text);
    });
  },

  // ── Canvas Interaction Events ────────────────────────────────────────────

  _wireInteraction() {
    let frameDragStart = null;

    this.canvas.on('object:moving', (e) => {
      const obj = e.target;
      if (obj === this.frameImage && this.phoneImage) {
        if (!frameDragStart) {
          frameDragStart = {
            frameLeft: obj.left,
            frameTop:  obj.top,
            phoneLeft: this.phoneImage.left,
            phoneTop:  this.phoneImage.top,
          };
        }
        const dx = obj.left - frameDragStart.frameLeft;
        const dy = obj.top  - frameDragStart.frameTop;
        this.phoneImage.set({
          left: frameDragStart.phoneLeft + dx,
          top:  frameDragStart.phoneTop + dy,
        });
        this._rebuildPhoneClip();
        this.phoneImage.setCoords();
      }
    });

    this.canvas.on('object:rotating', (e) => {
      const obj = e.target;
      if (obj === this.frameImage && this.phoneImage) {
        this.phoneImage.set('angle', obj.angle);
        this.phoneImage.setCoords();
      }
    });

    this.canvas.on('object:modified', (e) => {
      frameDragStart = null;
      const obj = e.target;
      const w = this.canvas.width;
      const h = this.canvas.height;

      if (obj === this.frameImage) {
        if (this._onLayoutChange) {
          this._onLayoutChange('phone', {
            xFrac: obj.left / w,
            yFrac: obj.top / h,
            angle: Math.round(obj.angle) || 0,
          });
        }
      } else if (obj === this.headlineText) {
        if (this._onLayoutChange) {
          this._onLayoutChange('headline', {
            xFrac: obj.left / w,
            yFrac: obj.top / h,
            angle: Math.round(obj.angle) || 0,
          });
        }
      } else if (obj === this.sublineText) {
        if (this._onLayoutChange) {
          this._onLayoutChange('subheadline', {
            xFrac: obj.left / w,
            yFrac: obj.top / h,
            angle: Math.round(obj.angle) || 0,
          });
        }
      }
    });
  },

  /** Rebuild the absolute-positioned clip path after the phone/frame moves */
  _rebuildPhoneClip() {
    if (!this.phoneImage || !this.frameImage) return;
    const device = this.currentDevice;
    const design = Devices.DESIGN[device];
    const frameNatW = this.frameImage.width;
    const frameTargW = this.frameImage.scaleX * frameNatW;
    const phonePixelScale = frameTargW / design.w;
    const screen = Devices.screenForPhone(
      device,
      this.frameImage.left,
      this.frameImage.top,
      phonePixelScale
    );
    this.phoneImage.clipPath = this._screenClipRect(device, screen);
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
          clipPath:   this._screenClipRect(device, screen),
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
          selectable: true,
          evented:    true,
          name:       'frame',
          lockScalingX: true,
          lockScalingY: true,
          hasControls: true,
          hasBorders: true,
        });
        img.setControlsVisibility({
          ml: false, mr: false, mt: false, mb: false,
          tl: false, tr: false, bl: false, br: false,
          mtr: true,
        });

        this.frameImage = img;
        c.add(img);
        this._reorderLayers();

        // Reapply layout now that frame is loaded
        if (this.currentTemplate) this._applyLayout(this.currentTemplate, this._layoutOverrides);
        c.renderAll();
      }
      // Note: no crossOrigin for local SVG files
    );
  },

  /** Ensure correct z-order: bg → split → phone → frame → headline → subline */
  _reorderLayers() {
    const c = this.canvas;
    // sendToBack puts item at index 0, pushing others up
    // Call in REVERSE of desired bottom-up order so bgRect ends at the bottom
    if (this.frameImage)   c.sendToBack(this.frameImage);
    if (this.phoneImage)   c.sendToBack(this.phoneImage);
    if (this.splitRect)    c.sendToBack(this.splitRect);
    if (this.bgRect)       c.sendToBack(this.bgRect);
    // Text always on top
    if (this.headlineText) c.bringToFront(this.headlineText);
    if (this.sublineText)  c.bringToFront(this.sublineText);
  },

  // ── Template Application ──────────────────────────────────────────────────

  applyTemplate(templateId, skipRender = false, overrides = null) {
    const tmpl = Templates.getById(templateId);
    this.currentTemplate = tmpl;
    this._layoutOverrides = overrides;

    this._applyBackground(tmpl);
    this._applyLayout(tmpl, overrides);
    this._autoFitText();

    this.canvas.bringToFront(this.headlineText);
    this.canvas.bringToFront(this.sublineText);
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

    c.sendToBack(this.splitRect);
    c.sendToBack(this.bgRect);
  },

  _applyLayout(tmpl, overrides) {
    const c  = this.canvas;
    const w  = c.width;
    const h  = c.height;
    const ov = overrides || {};

    // Resolve effective phone position
    const phoneCXFrac = ov.phoneXFrac != null ? ov.phoneXFrac : tmpl.phoneXFrac;
    const phoneCYFrac = ov.phoneYFrac != null ? ov.phoneYFrac : tmpl.phoneYFrac;
    const phoneAngle  = ov.phoneAngle || 0;

    // ── Position phone & its clip ──────────────────────────────────────────
    if (this.phoneImage) {
      const phoneCX = w * phoneCXFrac;
      const phoneCY = h * phoneCYFrac;
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
        angle:  phoneAngle,
        clipPath: this._screenClipRect(this.currentDevice, screen),
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
          angle:   phoneAngle,
        });
      }
    } else if (this.frameImage) {
      // No screenshot yet, still position frame
      const frameNatW = this.frameImage.width;
      const frameNatH = this.frameImage.height;
      const frameTargW = w * tmpl.phoneScale;
      const frameTargH = frameTargW * (frameNatH / frameNatW);
      this.frameImage.set({
        left:   w * phoneCXFrac,
        top:    h * phoneCYFrac,
        originX: 'center',
        originY: 'center',
        scaleX:  frameTargW / frameNatW,
        scaleY:  frameTargH / frameNatH,
        angle:   phoneAngle,
      });
    }

    // ── Position text ──────────────────────────────────────────────────────
    const hl = tmpl.headline;
    const sl = tmpl.subheadline;

    const hlXFrac = ov.headlineXFrac != null ? ov.headlineXFrac : hl.xFrac;
    const hlYFrac = ov.headlineYFrac != null ? ov.headlineYFrac : hl.yFrac;
    const hlAngle = ov.headlineAngle || 0;

    this.headlineText.set({
      left:       w * hlXFrac,
      top:        h * hlYFrac,
      originX:    hl.align === 'left' ? 'left' : 'center',
      originY:    'center',
      textAlign:  hl.align,
      fontSize:   Math.round(h * hl.sizeFrac),
      fill:       hl.color,
      fontWeight: hl.weight,
      angle:      hlAngle,
    });

    const slXFrac = ov.subheadlineXFrac != null ? ov.subheadlineXFrac : sl.xFrac;
    const slYFrac = ov.subheadlineYFrac != null ? ov.subheadlineYFrac : sl.yFrac;
    const slAngle = ov.subheadlineAngle || 0;

    this.sublineText.set({
      left:       w * slXFrac,
      top:        h * slYFrac,
      originX:    sl.align === 'left' ? 'left' : 'center',
      originY:    'center',
      textAlign:  sl.align,
      fontSize:   Math.round(h * sl.sizeFrac),
      fill:       sl.color,
      fontWeight: sl.weight,
      angle:      slAngle,
    });
  },

  // ── Programmatic rotation (from sidebar inputs) ───────────────────────────

  setPhoneAngle(angle) {
    if (this.frameImage) this.frameImage.set('angle', angle);
    if (this.phoneImage) this.phoneImage.set('angle', angle);
    this.canvas.renderAll();
  },

  setHeadlineAngle(angle) {
    this.headlineText.set('angle', angle);
    this.canvas.renderAll();
  },

  setSublineAngle(angle) {
    this.sublineText.set('angle', angle);
    this.canvas.renderAll();
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

    c.sendToBack(this.splitRect);
    c.sendToBack(this.bgRect);
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
    this._autoFitText();
    this.canvas.renderAll();
  },

  /** Shrink headline/subheadline fontSize if text overflows available width */
  _autoFitText() {
    const tmpl = this.currentTemplate;
    if (!tmpl) return;

    this._autoFitTextObj(this.headlineText, tmpl.headline);
    this._autoFitTextObj(this.sublineText, tmpl.subheadline);
  },

  _autoFitTextObj(textObj, cfg) {
    const tmpl = this.currentTemplate;
    if (!tmpl) return;
    const w = this.canvas.width;
    const maxW = this._textMaxWidth(tmpl, cfg);

    textObj.initDimensions();
    if (textObj.width > maxW && textObj.width > 0) {
      const newSize = Math.max(10, Math.floor(textObj.fontSize * (maxW / textObj.width)));
      textObj.set('fontSize', newSize);
      textObj.initDimensions();
    }
  },

  /** Create a rounded-rect clip path matching the device screen corners */
  _screenClipRect(device, screen) {
    const r = screen.w * (Devices.SCREEN_CORNER[device] || 0.04);
    return new fabric.Rect({
      width:             screen.w,
      height:            screen.h,
      left:              screen.x,
      top:               screen.y,
      rx:                r,
      ry:                r,
      absolutePositioned: true,
    });
  },

  _textMaxWidth(tmpl, cfg) {
    const w = this.canvas.width;
    if (cfg.align === 'left') {
      const phoneLeftEdge = (tmpl.phoneXFrac - tmpl.phoneScale * 0.5) * w;
      return Math.max(0.25 * w, phoneLeftEdge - cfg.xFrac * w - 16);
    }
    return w * 0.85;
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

  /** Get current layout positions/rotations for export */
  getLayoutState() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    return {
      phoneXFrac:       this.frameImage ? this.frameImage.left / w : null,
      phoneYFrac:       this.frameImage ? this.frameImage.top / h : null,
      phoneAngle:       this.frameImage ? (Math.round(this.frameImage.angle) || 0) : 0,
      headlineXFrac:    this.headlineText.left / w,
      headlineYFrac:    this.headlineText.top / h,
      headlineAngle:    Math.round(this.headlineText.angle) || 0,
      subheadlineXFrac: this.sublineText.left / w,
      subheadlineYFrac: this.sublineText.top / h,
      subheadlineAngle: Math.round(this.sublineText.angle) || 0,
    };
  },
};
