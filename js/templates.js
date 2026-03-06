/**
 * Painless Pixels — Template definitions
 *
 * Each template has:
 *   id, name             — identity
 *   layout               — controls phone and text positioning
 *   bg                   — background config
 *   phoneYFrac           — vertical center of phone as fraction of canvas height
 *   phoneXFrac           — horizontal center of phone as fraction of canvas width
 *   phoneScale           — how much of canvas width the phone occupies
 *   headline / subheadline — text style config
 *   preview              — CSS value for the template picker swatch
 *   lightBg              — true if the background is light (affects label color)
 */
const Templates = {

  defs: [
    {
      id: 'bold-dark',
      name: 'Bold Dark',
      layout: 'center-below',
      bg: { type: 'gradient', from: '#0d0d0d', to: '#18103a', angle: 145 },
      phoneXFrac: 0.5,
      phoneYFrac: 0.40,
      phoneScale: 0.78,
      headline: {
        color: '#ffffff',
        sizeFrac: 0.048,
        weight: 'bold',
        align: 'center',
        xFrac: 0.5,
        yFrac: 0.850,
      },
      subheadline: {
        color: '#8888aa',
        sizeFrac: 0.025,
        weight: 'normal',
        align: 'center',
        xFrac: 0.5,
        yFrac: 0.920,
      },
      preview: 'linear-gradient(145deg, #0d0d0d 0%, #18103a 100%)',
    },

    {
      id: 'clean-light',
      name: 'Clean Light',
      layout: 'center-above',
      bg: { type: 'gradient', from: '#f8f8f8', to: '#ebebf0', angle: 180 },
      phoneXFrac: 0.5,
      phoneYFrac: 0.60,
      phoneScale: 0.76,
      headline: {
        color: '#111111',
        sizeFrac: 0.046,
        weight: 'bold',
        align: 'center',
        xFrac: 0.5,
        yFrac: 0.095,
      },
      subheadline: {
        color: '#666666',
        sizeFrac: 0.025,
        weight: 'normal',
        align: 'center',
        xFrac: 0.5,
        yFrac: 0.160,
      },
      preview: 'linear-gradient(180deg, #f8f8f8 0%, #ebebf0 100%)',
      lightBg: true,
    },

    {
      id: 'gradient-pop',
      name: 'Gradient Pop',
      layout: 'right-left',
      bg: { type: 'gradient', from: '#5b5fcf', to: '#a855f7', angle: 140 },
      phoneXFrac: 0.68,
      phoneYFrac: 0.50,
      phoneScale: 0.72,
      headline: {
        color: '#ffffff',
        sizeFrac: 0.048,
        weight: 'bold',
        align: 'left',
        xFrac: 0.07,
        yFrac: 0.340,
      },
      subheadline: {
        color: 'rgba(255,255,255,0.75)',
        sizeFrac: 0.025,
        weight: 'normal',
        align: 'left',
        xFrac: 0.07,
        yFrac: 0.430,
      },
      preview: 'linear-gradient(140deg, #5b5fcf 0%, #a855f7 100%)',
    },

    {
      id: 'feature-callout',
      name: 'Feature',
      layout: 'right-left',
      bg: { type: 'solid', color: '#0c1220' },
      phoneXFrac: 0.68,
      phoneYFrac: 0.50,
      phoneScale: 0.70,
      headline: {
        color: '#e2e8f0',
        sizeFrac: 0.044,
        weight: 'bold',
        align: 'left',
        xFrac: 0.07,
        yFrac: 0.280,
      },
      subheadline: {
        color: '#64748b',
        sizeFrac: 0.024,
        weight: 'normal',
        align: 'left',
        xFrac: 0.07,
        yFrac: 0.360,
      },
      preview: '#0c1220',
    },

    {
      id: 'split-color',
      name: 'Split',
      layout: 'center-split',
      bg: { type: 'split', top: '#5b5fcf', bottom: '#f5f5f5' },
      phoneXFrac: 0.5,
      phoneYFrac: 0.50,
      phoneScale: 0.78,
      headline: {
        color: '#ffffff',
        sizeFrac: 0.046,
        weight: 'bold',
        align: 'center',
        xFrac: 0.5,
        yFrac: 0.115,
      },
      subheadline: {
        color: 'rgba(255,255,255,0.82)',
        sizeFrac: 0.025,
        weight: 'normal',
        align: 'center',
        xFrac: 0.5,
        yFrac: 0.185,
      },
      preview: 'linear-gradient(180deg, #5b5fcf 50%, #f5f5f5 50%)',
    },

    {
      id: 'minimal-frame',
      name: 'Minimal',
      layout: 'center-below',
      bg: { type: 'solid', color: '#fafafa' },
      phoneXFrac: 0.5,
      phoneYFrac: 0.42,
      phoneScale: 0.76,
      headline: {
        color: '#111111',
        sizeFrac: 0.040,
        weight: '600',
        align: 'center',
        xFrac: 0.5,
        yFrac: 0.855,
      },
      subheadline: {
        color: '#999999',
        sizeFrac: 0.023,
        weight: 'normal',
        align: 'center',
        xFrac: 0.5,
        yFrac: 0.920,
      },
      preview: '#fafafa',
      lightBg: true,
    },

    {
      id: 'neon-night',
      name: 'Neon Night',
      layout: 'center-above',
      bg: { type: 'gradient', from: '#040410', to: '#0c0c28', angle: 180 },
      phoneXFrac: 0.5,
      phoneYFrac: 0.60,
      phoneScale: 0.76,
      headline: {
        color: '#a5b4fc',
        sizeFrac: 0.048,
        weight: 'bold',
        align: 'center',
        xFrac: 0.5,
        yFrac: 0.095,
      },
      subheadline: {
        color: '#5b5fcf',
        sizeFrac: 0.025,
        weight: 'normal',
        align: 'center',
        xFrac: 0.5,
        yFrac: 0.160,
      },
      preview: 'linear-gradient(180deg, #040410 0%, #0c0c28 100%)',
    },

    {
      id: 'warm-burst',
      name: 'Warm',
      layout: 'right-left',
      bg: { type: 'gradient', from: '#f43f5e', to: '#fb923c', angle: 135 },
      phoneXFrac: 0.65,
      phoneYFrac: 0.50,
      phoneScale: 0.72,
      headline: {
        color: '#ffffff',
        sizeFrac: 0.048,
        weight: 'bold',
        align: 'left',
        xFrac: 0.07,
        yFrac: 0.340,
      },
      subheadline: {
        color: 'rgba(255,255,255,0.80)',
        sizeFrac: 0.025,
        weight: 'normal',
        align: 'left',
        xFrac: 0.07,
        yFrac: 0.430,
      },
      preview: 'linear-gradient(135deg, #f43f5e 0%, #fb923c 100%)',
    },
  ],

  /** Return template def by id, fallback to first */
  getById(id) {
    return this.defs.find(t => t.id === id) || this.defs[0];
  },

  /**
   * Inject template picker swatches into #template-grid
   * @param {string} activeId
   * @param {Function} onSelect — callback(templateId)
   */
  renderGrid(container, activeId, onSelect) {
    container.innerHTML = '';
    this.defs.forEach(tmpl => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'template-swatch' +
        (tmpl.lightBg ? ' light-template' : '') +
        (tmpl.id === activeId ? ' active' : '');
      el.dataset.templateId = tmpl.id;
      el.setAttribute('aria-pressed', tmpl.id === activeId ? 'true' : 'false');
      el.setAttribute('aria-label', tmpl.name);
      el.innerHTML = `
        <div class="template-swatch-bg" style="background:${tmpl.preview}"></div>
        <span class="template-swatch-label" aria-hidden="true">${tmpl.name}</span>
      `;
      el.addEventListener('click', () => {
        container.querySelectorAll('.template-swatch').forEach(s => {
          s.classList.remove('active');
          s.setAttribute('aria-pressed', 'false');
        });
        el.classList.add('active');
        el.setAttribute('aria-pressed', 'true');
        onSelect(tmpl.id);
      });
      container.appendChild(el);
    });
  },
};
