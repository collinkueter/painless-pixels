/**
 * Painless Pixels — Background Controls
 *
 * Wires background type toggle, color pickers, angle slider.
 * Subscribes to State for auto-sync (replaces syncBgControls).
 */
(function () {
  'use strict';

  var S = PP.State;

  var BG_PRESETS = [
    { label: 'Indigo Night',  type: 'gradient', from: '#0d0d0d', to: '#18103a', angle: 145 },
    { label: 'Purple Haze',   type: 'gradient', from: '#5b5fcf', to: '#a855f7', angle: 140 },
    { label: 'Ocean',         type: 'gradient', from: '#0369a1', to: '#06b6d4', angle: 135 },
    { label: 'Sunset',        type: 'gradient', from: '#f43f5e', to: '#fb923c', angle: 135 },
    { label: 'Forest',        type: 'gradient', from: '#065f46', to: '#34d399', angle: 145 },
    { label: 'Midnight',      type: 'gradient', from: '#040410', to: '#0c0c28', angle: 180 },
    { label: 'Peach',         type: 'gradient', from: '#fbbf24', to: '#f472b6', angle: 135 },
    { label: 'Cool Slate',    type: 'gradient', from: '#334155', to: '#1e293b', angle: 180 },
    { label: 'Rose',          type: 'gradient', from: '#be123c', to: '#881337', angle: 160 },
    { label: 'Black',         type: 'solid', color: '#0a0a0a' },
    { label: 'White',         type: 'solid', color: '#f8f8f8' },
    { label: 'Deep Indigo',   type: 'solid', color: '#1e1b4b' },
  ];

  var debouncedBgUpdate = Utils.debounce(function () {
    Editor.updateBackground({
      bgType:        S.bgType,
      bgFrom:        S.bgFrom,
      bgTo:          S.bgTo,
      bgAngle:       S.bgAngle,
      bgSolid:       S.bgSolid,
      bgSplitTop:    S.bgSplitTop,
      bgSplitBottom: S.bgSplitBottom,
    });
  }, 50);

  function applyBgUpdate() {
    PP.autoTextColor();
    debouncedBgUpdate();
    PP.debouncedTextUpdate();
    PP.markDirty();
  }

  PP.wireBgControls = function () {
    var fromEl       = Utils.$('#bg-from');
    var fromHex      = Utils.$('#bg-from-hex');
    var toEl         = Utils.$('#bg-to');
    var toHex        = Utils.$('#bg-to-hex');
    var angleEl      = Utils.$('#bg-angle');
    var angleDisplay = Utils.$('#angle-display');
    var solidEl      = Utils.$('#bg-solid');
    var solidHex     = Utils.$('#bg-solid-hex');

    // ── Presets row ─────────────────────────────────────────────────
    var presetsContainer = Utils.$('#bg-presets');
    if (presetsContainer) {
      BG_PRESETS.forEach(function (preset, i) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'bg-preset-chip';
        chip.setAttribute('aria-label', preset.label);
        chip.setAttribute('role', 'radio');
        chip.setAttribute('aria-checked', 'false');
        chip.title = preset.label;
        if (preset.type === 'gradient') {
          chip.style.background = 'linear-gradient(' + preset.angle + 'deg, ' + preset.from + ', ' + preset.to + ')';
        } else {
          chip.style.background = preset.color;
        }
        if (preset.type === 'solid' && Utils.isLight(preset.color)) {
          chip.classList.add('light-preset');
        }
        chip.addEventListener('click', function () {
          presetsContainer.querySelectorAll('.bg-preset-chip').forEach(function (c) {
            c.classList.remove('active');
          });
          chip.classList.add('active');
          chip.setAttribute('aria-checked', 'true');
          S._batch(function () {
            if (preset.type === 'gradient') {
              S.bgType  = 'gradient';
              S.bgFrom  = preset.from;
              S.bgTo    = preset.to;
              S.bgAngle = preset.angle;
            } else {
              S.bgType  = 'solid';
              S.bgSolid = preset.color;
            }
          });
          applyBgUpdate();
        });
        presetsContainer.appendChild(chip);
      });
    }

    // ── Subscriptions (replace syncBgControls) ──────────────────────

    function clearPresetActive() {
      if (presetsContainer) {
        presetsContainer.querySelectorAll('.bg-preset-chip').forEach(function (c) {
          c.classList.remove('active');
          c.setAttribute('aria-checked', 'false');
        });
      }
    }

    S._subscribe('bgFrom', function (val) {
      if (fromEl)  fromEl.value = val;
      if (fromHex) fromHex.textContent = val;
      clearPresetActive();
    });
    S._subscribe('bgTo', function (val) {
      if (toEl)  toEl.value = val;
      if (toHex) toHex.textContent = val;
      clearPresetActive();
    });
    S._subscribe('bgAngle', function (val) {
      if (angleEl)      angleEl.value = val;
      if (angleDisplay) angleDisplay.textContent = val + '\u00B0';
      clearPresetActive();
    });
    S._subscribe('bgSolid', function (val) {
      if (solidEl)  solidEl.value = val;
      if (solidHex) solidHex.textContent = val;
      clearPresetActive();
    });
    S._subscribe('bgType', function (val) {
      Utils.$('#bg-gradient-pane').classList.toggle('active', val === 'gradient');
      Utils.$('#bg-solid-pane').classList.toggle('active',    val === 'solid');
      Utils.$$('.bg-toggle-btn').forEach(function (btn) {
        var isActive = btn.dataset.bg === val;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    });

    // ── Event listeners ─────────────────────────────────────────────

    // Toggle gradient / solid
    Utils.$$('.bg-toggle-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        S.bgType = btn.dataset.bg;
        applyBgUpdate();
      });
    });

    // Gradient from
    if (fromEl) {
      fromEl.addEventListener('input', function () {
        S.bgFrom = fromEl.value;
        applyBgUpdate();
      });
    }

    // Gradient to
    if (toEl) {
      toEl.addEventListener('input', function () {
        S.bgTo = toEl.value;
        applyBgUpdate();
      });
    }

    // Angle
    if (angleEl) {
      angleEl.addEventListener('input', function () {
        S.bgAngle = parseInt(angleEl.value, 10);
        applyBgUpdate();
      });
    }

    // Solid
    if (solidEl) {
      solidEl.addEventListener('input', function () {
        S.bgSolid = solidEl.value;
        applyBgUpdate();
      });
    }
  };

})();
