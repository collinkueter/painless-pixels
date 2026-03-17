/**
 * Painless Pixels — Export Engine
 *
 * Renders each slide × each target size to an OffscreenCanvas (or regular Canvas
 * as fallback), then packages everything into a ZIP file.
 *
 * Render stack (bottom → top):
 *   1. Background (gradient or solid)
 *   2. User screenshot (clipped to device screen area, cover-fit)
 *   3. Device frame SVG (drawn on top; transparent screen area shows screenshot)
 *   4. Headline text
 *   5. Subheadline text
 */
const Exporter = {

  /**
   * Main entry point.
   *
   * @param {Object}   opts
   * @param {Object[]} opts.slides         — flat array of slide objects (each with imageData + optional tabletImageData)
   * @param {string[]} opts.selectedOSes   — ['ios', 'android'] etc
   * @param {Function} opts.onProgress     — (current, total, label) => void
   * @returns {Promise<void>}              — triggers ZIP download when done
   */
  async run(opts) {
    const { slides, selectedOSes, onProgress } = opts;

    if (!slides || !slides.length) return;

    // Collect all (device, specs) pairs for selected OSes
    const jobs = [];
    for (const os of selectedOSes) {
      const devices = Devices.OS_DEVICES[os] || [];
      for (const device of devices) {
        const specs = Devices.EXPORT_SPECS[device] || [];
        if (!specs.length) continue;
        jobs.push({ device, specs });
      }
    }

    // Count total renders
    let total = 0;
    for (const job of jobs) total += slides.length * job.specs.length;
    let current = 0;

    // Preload Syne so canvas text rendering gets the right font
    try {
      await document.fonts.load('bold 40px Syne');
      await document.fonts.load('normal 40px Syne');
    } catch (_) { /* font unavailable — canvas falls back to system-ui */ }

    const zip = new JSZip();

    for (const job of jobs) {
      const { device, specs } = job;
      const isTablet = Devices.isTablet(device);

      // Frame image is shared across slides (device-level)
      const frameImg = await this._loadFrame(Devices.FRAME_PATH[device]).catch(() => null);

      for (const [si, slide] of slides.entries()) {
        // Pick the right image for this device form factor
        const imgSrc = (isTablet && slide.tabletImageData) ? slide.tabletImageData : slide.imageData;
        const screenshotImg = await this._loadImage(imgSrc).catch(() => null);

        // Each slide carries its own design settings
        const tmpl = Templates.getById(slide.templateId);
        const params = this.buildRenderParams(slide);

        for (const spec of specs) {
          current++;
          if (onProgress) onProgress(current, total, spec.label + ' — slide ' + (si + 1));

          const blob = await this._renderSlide({
            spec, device, tmpl,
            bgState: params.bgState, textState: params.textState, layoutState: params.layoutState,
            screenshotImg, frameImg,
          });

          if (blob) {
            zip.file(spec.path + '_' + (si + 1) + '.png', blob);
          }
        }
      }
    }

    const zipBlob = await zip.generateAsync({
      type:        'blob',
      compression: 'STORE',
    });

    saveAs(zipBlob, 'screenshots.zip');
  },

  // ── Per-slide renderer ────────────────────────────────────────────────────

  async _renderSlide({ spec, device, tmpl, bgState, textState, layoutState, screenshotImg, frameImg }) {
    const W = spec.w;
    const H = spec.h;
    const ls = layoutState || {};

    // Always use HTMLCanvas — OffscreenCanvas doesn't inherit document fonts
    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    try {
      // Resolve effective phone position (custom override or template default)
      const phoneCX    = W * (ls.phoneXFrac != null ? ls.phoneXFrac : tmpl.phoneXFrac);
      const phoneCY    = H * (ls.phoneYFrac != null ? ls.phoneYFrac : tmpl.phoneYFrac);
      const phoneAngle = ls.phoneAngle || 0;
      const orientation = ls.orientation || 'portrait';
      const rotated = Devices.isRotated(device, orientation);

      // ── 1. Background ───────────────────────────────────────────────────────
      this._drawBackground(ctx, W, H, tmpl, bgState);

      // Effective dimensions account for orientation (swapped if rotated)
      const design = Devices.effectiveDesign(device, orientation);
      const phonePixelScale = (W * tmpl.phoneScale) / design.w;
      const screen = Devices.screenForPhone(device, phoneCX, phoneCY, phonePixelScale, orientation);

      // ── 2. Screenshot ───────────────────────────────────────────────────────
      if (screenshotImg) {
        ctx.save();
        if (phoneAngle) {
          ctx.translate(phoneCX, phoneCY);
          ctx.rotate(phoneAngle * Math.PI / 180);
          ctx.translate(-phoneCX, -phoneCY);
        }

        // Clip to screen rectangle (in effective coordinate space)
        ctx.beginPath();
        this._roundedRect(ctx, screen.x, screen.y, screen.w, screen.h, screen.w * (Devices.SCREEN_CORNER[device] || 0.04));
        ctx.clip();

        // Cover-fit the screenshot into the screen
        var fit = this._coverFit(
          screenshotImg.naturalWidth  || screenshotImg.width,
          screenshotImg.naturalHeight || screenshotImg.height,
          screen.x, screen.y, screen.w, screen.h
        );
        ctx.drawImage(screenshotImg, fit.sx, fit.sy, fit.sw, fit.sh, fit.dx, fit.dy, fit.dw, fit.dh);
        ctx.restore();
      }

      // ── 3. Device Frame ─────────────────────────────────────────────────────
      if (frameImg) {
        // The frame PNG is in native orientation — compute how to draw it
        const frameNatW  = frameImg.naturalWidth  || frameImg.width;
        const frameNatH  = frameImg.naturalHeight || frameImg.height;

        // Effective phone dimensions in canvas pixels
        var phoneW = design.w * phonePixelScale;
        var phoneH = design.h * phonePixelScale;

        ctx.save();
        ctx.translate(phoneCX, phoneCY);
        if (phoneAngle) ctx.rotate(phoneAngle * Math.PI / 180);

        if (rotated) {
          // Rotate the frame image to match the target orientation
          var frameRotation = Devices.nativeOrientation(device) === 'portrait' ? -90 : 90;
          ctx.rotate(frameRotation * Math.PI / 180);
          // In rotated space, draw using native frame dimensions scaled to fill phone area
          // After rotation, native W maps to visual H and vice versa
          var drawW = phoneH;  // native frame width fills the visual height
          var drawH = phoneW;  // native frame height fills the visual width
          ctx.drawImage(frameImg, -drawW / 2, -drawH / 2, drawW, drawH);
        } else {
          ctx.drawImage(frameImg, -phoneW / 2, -phoneH / 2, phoneW, phoneH);
        }
        ctx.restore();
      }

      // ── 4 & 5. Text ─────────────────────────────────────────────────────────
      this._drawText(ctx, W, H, tmpl, textState, device, ls);
    } catch (_) {
      // Draw at least a solid background so the preview isn't blank
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, W, H);
    }

    // ── Return rendered result ──────────────────────────────────────────────
    // asCanvas: return the canvas element directly (for DOM display, avoids
    //           taint issues on file:// where toDataURL would throw).
    // asDataURL: return a data URL string (for <img> src).
    // Otherwise: return a Blob (for ZIP export).
    if (spec.asCanvas) {
      return canvas;
    }

    if (spec.asDataURL) {
      try {
        var dataURL = canvas.toDataURL('image/png');
        canvas.width = 0;
        canvas.height = 0;
        return dataURL;
      } catch (_) {
        // Canvas tainted (file:// frames) — return canvas element as fallback
        return canvas;
      }
    }

    return new Promise(resolve => {
      try {
        canvas.toBlob(function (blob) {
          canvas.width = 0;
          canvas.height = 0;
          resolve(blob);
        }, 'image/png');
      } catch (_) {
        canvas.width = 0;
        canvas.height = 0;
        resolve(null);
      }
    });
  },

  // ── Background ────────────────────────────────────────────────────────────

  _drawBackground(ctx, W, H, tmpl, bgState) {
    const type = (bgState && bgState.bgType) || tmpl.bg.type;

    if (type === 'split') {
      ctx.fillStyle = (bgState && bgState.bgSplitTop) || tmpl.bg.top || '#5b5fcf';
      ctx.fillRect(0, 0, W, H / 2);
      ctx.fillStyle = (bgState && bgState.bgSplitBottom) || tmpl.bg.bottom || '#f5f5f5';
      ctx.fillRect(0, H / 2, W, H / 2);
      return;
    }

    if (type === 'gradient') {
      const from  = (bgState && bgState.bgFrom)  || tmpl.bg.from  || tmpl.bg.color || '#000';
      const to    = (bgState && bgState.bgTo)    || tmpl.bg.to    || tmpl.bg.color || '#000';
      const angle = (bgState && bgState.bgAngle !== undefined) ? bgState.bgAngle : (tmpl.bg.angle || 135);
      const coords = Utils.angleToCoords(angle, W, H);
      const grad   = ctx.createLinearGradient(coords.x1, coords.y1, coords.x2, coords.y2);
      grad.addColorStop(0, from);
      grad.addColorStop(1, to);
      ctx.fillStyle = grad;
    } else {
      // solid
      ctx.fillStyle = (bgState && bgState.bgSolid) || tmpl.bg.color || tmpl.bg.from || '#000';
    }
    ctx.fillRect(0, 0, W, H);
  },

  // ── Text ──────────────────────────────────────────────────────────────────

  _drawText(ctx, W, H, tmpl, textState, device, layoutState) {
    const ts        = textState || {};
    const ls        = layoutState || {};
    const orientation = (ls && ls.orientation) || 'portrait';
    const previewH  = Devices.effectivePreview(device || 'iphone', orientation).h;
    const scale     = H / previewH;

    // ── Headline ────────────────────────────────────────────────────────────
    {
      const hl       = tmpl.headline;
      const text     = ts.headline || '';
      let   fontSize = ts.hlFontSize ? Math.round(ts.hlFontSize * scale)
                                     : Math.round(H * hl.sizeFrac);
      const color  = ts.hlColor  || hl.color;
      const weight = ts.hlWeight || hl.weight;
      const align  = ts.hlAlign  || hl.align;
      const x      = W * (ls.headlineXFrac != null ? ls.headlineXFrac : hl.xFrac);
      const y      = H * (ls.headlineYFrac != null ? ls.headlineYFrac : hl.yFrac);
      const angle  = ls.headlineAngle || 0;
      const maxW   = this._maxTextWidth(W, H, tmpl, hl);

      ctx.save();
      if (angle) {
        ctx.translate(x, y);
        ctx.rotate(angle * Math.PI / 180);
        ctx.translate(-x, -y);
      }

      ctx.font         = `${weight} ${fontSize}px 'Syne', system-ui, sans-serif`;
      ctx.fillStyle    = color;
      ctx.textAlign    = align;
      ctx.textBaseline = 'middle';

      // Auto-fit: shrink if text overflows available width
      const measuredW = ctx.measureText(text).width;
      if (measuredW > maxW && measuredW > 0) {
        fontSize = Math.max(10, Math.floor(fontSize * (maxW / measuredW)));
        ctx.font = `${weight} ${fontSize}px 'Syne', system-ui, sans-serif`;
      }

      const lines = this._wrapText(ctx, text, maxW);
      this._fillLines(ctx, lines, x, y, fontSize * 1.25);
      ctx.restore();
    }

    // ── Subheadline ─────────────────────────────────────────────────────────
    {
      const sl       = tmpl.subheadline;
      const text     = ts.subheadline || '';
      let   fontSize = ts.slFontSize ? Math.round(ts.slFontSize * scale)
                                     : Math.round(H * sl.sizeFrac);
      const color  = ts.slColor  || sl.color;
      const weight = ts.slWeight || sl.weight;
      const align  = ts.slAlign  || sl.align;
      const x      = W * (ls.subheadlineXFrac != null ? ls.subheadlineXFrac : sl.xFrac);
      const y      = H * (ls.subheadlineYFrac != null ? ls.subheadlineYFrac : sl.yFrac);
      const angle  = ls.subheadlineAngle || 0;
      const maxW   = this._maxTextWidth(W, H, tmpl, sl);

      ctx.save();
      if (angle) {
        ctx.translate(x, y);
        ctx.rotate(angle * Math.PI / 180);
        ctx.translate(-x, -y);
      }

      ctx.font         = `${weight} ${fontSize}px 'Syne', system-ui, sans-serif`;
      ctx.fillStyle    = color;
      ctx.textAlign    = align;
      ctx.textBaseline = 'middle';

      // Auto-fit: shrink if text overflows available width
      const measuredW = ctx.measureText(text).width;
      if (measuredW > maxW && measuredW > 0) {
        fontSize = Math.max(10, Math.floor(fontSize * (maxW / measuredW)));
        ctx.font = `${weight} ${fontSize}px 'Syne', system-ui, sans-serif`;
      }

      const lines = this._wrapText(ctx, text, maxW);
      this._fillLines(ctx, lines, x, y, fontSize * 1.4);
      ctx.restore();
    }
  },

  /** Compute available text width for a given text config + template */
  _maxTextWidth(W, H, tmpl, textCfg) {
    if (textCfg.align === 'left') {
      // Text is left-aligned; cap at phone's left edge minus a small margin
      const phoneLeftEdge = (tmpl.phoneXFrac - tmpl.phoneScale * 0.5) * W;
      return Math.max(0.25 * W, phoneLeftEdge - textCfg.xFrac * W - 16);
    }
    // Centered — use 85% of canvas width as max (padding on each side)
    return W * 0.85;
  },

  /** Break text into lines that fit within maxWidth */
  _wrapText(ctx, text, maxWidth) {
    if (!text) return [];
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let line    = '';

    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines;
  },

  /** Draw an array of text lines centred vertically around y */
  _fillLines(ctx, lines, x, y, lineH) {
    const totalH = (lines.length - 1) * lineH;
    let currY    = y - totalH / 2;
    // Clamp so first line never clips off the top of the canvas
    const minY = lineH * 0.55;
    if (currY < minY) currY = minY;
    for (const line of lines) {
      ctx.fillText(line, x, currY);
      currY += lineH;
    }
  },

  // ── Render parameter builders ────────────────────────────────────────────

  /** Build bgState/textState/layoutState from a slide object for rendering */
  buildRenderParams(slide, orientation) {
    return {
      bgState: {
        bgType: slide.bgType, bgFrom: slide.bgFrom, bgTo: slide.bgTo,
        bgAngle: slide.bgAngle, bgSolid: slide.bgSolid,
        bgSplitTop: slide.bgSplitTop, bgSplitBottom: slide.bgSplitBottom,
      },
      textState: {
        headline: slide.headline, subheadline: slide.subheadline,
        hlFontSize: slide.headlineSize, hlColor: slide.textColor,
        slFontSize: slide.subheadlineSize, slColor: slide.subheadlineColor,
      },
      layoutState: {
        phoneXFrac: slide.phoneXFrac, phoneYFrac: slide.phoneYFrac, phoneAngle: slide.phoneAngle,
        headlineXFrac: slide.headlineXFrac, headlineYFrac: slide.headlineYFrac, headlineAngle: slide.headlineAngle,
        subheadlineXFrac: slide.subheadlineXFrac, subheadlineYFrac: slide.subheadlineYFrac, subheadlineAngle: slide.subheadlineAngle,
        orientation: orientation || slide.orientation || 'portrait',
      },
    };
  },

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Load an image, returning an HTMLImageElement ready for canvas drawing.
   *
   * Local asset paths (e.g. device frames) are loaded via a hidden <canvas>
   * round-trip so they never taint the export canvas, regardless of CORS
   * headers or file:// protocol.
   */
  _frameCache: {},

  _loadImage(src) {
    if (!src) return Promise.reject(new Error('no src'));

    return new Promise((resolve, reject) => {
      const img = new Image();
      // Only set crossOrigin for HTTP URLs — data: and blob: URLs are always
      // same-origin and setting crossOrigin on them can taint the canvas in
      // some browsers (notably Safari).
      if (src.startsWith('http')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload  = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  },

  /**
   * Load a device frame image in a way that never taints the canvas.
   * Uses fetch → blob URL (same-origin, no taint). On file:// where
   * fetch is blocked, falls back to a plain <img> load (may taint
   * canvas for toDataURL, but still works for direct canvas display).
   */
  async _loadFrame(path) {
    if (this._frameCache[path]) return this._frameCache[path];

    let img;
    if (window.location.protocol !== 'file:') {
      // HTTP: fetch → blob URL — guaranteed same-origin, no taint
      try {
        const resp = await fetch(path);
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        img = await new Promise((resolve, reject) => {
          const el = new Image();
          el.onload  = () => resolve(el);
          el.onerror = reject;
          el.src = url;
        });
      } catch (_) {}
    }

    if (!img) {
      // file:// or fetch failed: load via <img> directly.
      // May taint canvases (toDataURL fails), but _renderSlide
      // handles this by returning the canvas element for display.
      img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload  = () => resolve(el);
        el.onerror = reject;
        el.src = path;
      });
    }

    this._frameCache[path] = img;
    return img;
  },

  /**
   * Compute cover-fit source / dest rectangles.
   * Returns { sx, sy, sw, sh, dx, dy, dw, dh }
   */
  _coverFit(srcW, srcH, destX, destY, destW, destH) {
    const destAR = destW / destH;
    const srcAR  = srcW  / srcH;
    let sw, sh, sx, sy;

    if (srcAR > destAR) {
      // source wider: crop sides
      sh = srcH;
      sw = srcH * destAR;
      sx = (srcW - sw) / 2;
      sy = 0;
    } else {
      // source taller: crop top/bottom
      sw = srcW;
      sh = srcW / destAR;
      sx = 0;
      sy = (srcH - sh) / 2;
    }

    return { sx, sy, sw, sh, dx: destX, dy: destY, dw: destW, dh: destH };
  },

  _roundedRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  },
};
