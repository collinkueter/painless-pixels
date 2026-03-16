/**
 * Painless Pixels — Background Controls
 *
 * Wires background type toggle, color pickers, angle slider.
 * Subscribes to State for auto-sync (replaces syncBgControls).
 */
(function () {
  'use strict';

  var S = PP.State;

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

    // ── Subscriptions (replace syncBgControls) ──────────────────────
    S._subscribe('bgFrom', function (val) {
      if (fromEl)  fromEl.value = val;
      if (fromHex) fromHex.textContent = val;
    });
    S._subscribe('bgTo', function (val) {
      if (toEl)  toEl.value = val;
      if (toHex) toHex.textContent = val;
    });
    S._subscribe('bgAngle', function (val) {
      if (angleEl)      angleEl.value = val;
      if (angleDisplay) angleDisplay.textContent = val + '\u00B0';
    });
    S._subscribe('bgSolid', function (val) {
      if (solidEl)  solidEl.value = val;
      if (solidHex) solidHex.textContent = val;
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
