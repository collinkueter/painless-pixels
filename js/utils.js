/**
 * Painless Pixels — Shared utilities
 */
const Utils = {

  /** Debounce fn by delay ms */
  debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  /** Clamp value between min and max */
  clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  },

  /**
   * Convert a CSS-style gradient angle (degrees) to canvas gradient coordinates.
   * Returns { x1, y1, x2, y2 } in pixels for a canvas of given dimensions.
   */
  angleToCoords(angleDeg, width, height) {
    // CSS gradient angle: 0° = bottom-to-top, 90° = left-to-right
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    const cx = width / 2;
    const cy = height / 2;
    // half-diagonal length so gradient spans the full canvas
    const halfLen = Math.sqrt(width * width + height * height) / 2;
    return {
      x1: cx - Math.cos(rad) * halfLen,
      y1: cy - Math.sin(rad) * halfLen,
      x2: cx + Math.cos(rad) * halfLen,
      y2: cy + Math.sin(rad) * halfLen,
    };
  },

  /** Generate a short random ID */
  uid() {
    return Math.random().toString(36).slice(2, 10);
  },

  /** Read a File as a base-64 data URL, returns Promise<string> */
  loadFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  /** Load an image from a URL, returns Promise<HTMLImageElement> */
  loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  },

  /** Ensure hex string starts with # */
  normalizeHex(hex) {
    return hex && !hex.startsWith('#') ? '#' + hex : hex;
  },

  /** Parse a hex color (#rgb or #rrggbb) to {r, g, b} 0-255 */
  hexToRgb(hex) {
    hex = (hex || '#000000').replace('#', '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  },

  /** Relative luminance (0 = black, 1 = white) per WCAG */
  luminance(hex) {
    const { r, g, b } = this.hexToRgb(hex);
    const [rs, gs, bs] = [r, g, b].map(c => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  },

  /** Returns true if the color is perceptually light */
  isLight(hex) {
    return this.luminance(hex) > 0.35;
  },

  /** Average two hex colors */
  averageHex(hex1, hex2) {
    const a = this.hexToRgb(hex1);
    const b = this.hexToRgb(hex2);
    const r = Math.round((a.r + b.r) / 2);
    const g = Math.round((a.g + b.g) / 2);
    const bl = Math.round((a.b + b.b) / 2);
    return '#' + [r, g, bl].map(c => c.toString(16).padStart(2, '0')).join('');
  },

  // ── DOM shortcuts ────────────────────────────────────────────────────────

  $(sel, root = document) { return root.querySelector(sel); },
  $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); },

  show(el) { el && el.classList.remove('hidden'); },
  hide(el) { el && el.classList.add('hidden'); },

  /** Set element's active class, toggling from siblings */
  setActive(el, activeClass = 'active') {
    const siblings = el.parentElement
      ? Array.from(el.parentElement.children)
      : [];
    siblings.forEach(s => s.classList.remove(activeClass));
    el.classList.add(activeClass);
  },
};
