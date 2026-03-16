/**
 * Painless Pixels — Text Controls
 *
 * Wires headline/subheadline inputs, size, and color pickers.
 * Subscribes to State for auto-sync (replaces manual text sync in syncAllControls).
 */
(function () {
  'use strict';

  var S = PP.State;

  var debouncedTextUpdate = Utils.debounce(function () {
    Editor.updateText({
      headline:         S.headline,
      subheadline:      S.subheadline,
      headlineSize:     S.headlineSize,
      subheadlineSize:  S.subheadlineSize,
      textColor:        S.textColor,
      subheadlineColor: S.subheadlineColor,
    });
  }, 150);

  // Expose for controls-bg.js (applyBgUpdate calls this after autoTextColor)
  PP.debouncedTextUpdate = debouncedTextUpdate;

  PP.wireTextFields = function () {
    var hlInput     = Utils.$('#headline-input');
    var slInput     = Utils.$('#subheadline-input');
    var sizeInput   = Utils.$('#headline-size');
    var slSizeInput = Utils.$('#subheadline-size');
    var colorEl     = Utils.$('#text-color');
    var hexLabel    = Utils.$('#text-color-hex');
    var slColorEl   = Utils.$('#subheadline-color');
    var slHexLabel  = Utils.$('#subheadline-color-hex');

    // ── Subscriptions (replace manual text sync) ────────────────────
    S._subscribe('headline', function (val) {
      if (hlInput) hlInput.value = val;
    });
    S._subscribe('subheadline', function (val) {
      if (slInput) slInput.value = val;
    });
    S._subscribe('headlineSize', function (val) {
      if (sizeInput) sizeInput.value = val;
    });
    S._subscribe('subheadlineSize', function (val) {
      if (slSizeInput) slSizeInput.value = val;
    });
    S._subscribe('textColor', function (val) {
      if (colorEl)  colorEl.value = val;
      if (hexLabel) hexLabel.textContent = val;
    });
    S._subscribe('subheadlineColor', function (val) {
      if (slColorEl)  slColorEl.value = val;
      if (slHexLabel) slHexLabel.textContent = val;
    });

    // ── Event listeners ─────────────────────────────────────────────
    if (hlInput) {
      hlInput.addEventListener('input', function () {
        S.headline = hlInput.value;
        debouncedTextUpdate();
        PP.markDirty();
      });
    }

    if (slInput) {
      slInput.addEventListener('input', function () {
        S.subheadline = slInput.value;
        debouncedTextUpdate();
        PP.markDirty();
      });
    }

    if (sizeInput) {
      sizeInput.addEventListener('input', function () {
        S.headlineSize = parseInt(sizeInput.value, 10) || 38;
        debouncedTextUpdate();
        PP.markDirty();
      });
    }

    if (colorEl) {
      colorEl.addEventListener('input', function () {
        S.textColor = colorEl.value;
        debouncedTextUpdate();
        PP.markDirty();
      });
    }

    if (slSizeInput) {
      slSizeInput.addEventListener('input', function () {
        S.subheadlineSize = parseInt(slSizeInput.value, 10) || 20;
        debouncedTextUpdate();
        PP.markDirty();
      });
    }

    if (slColorEl) {
      slColorEl.addEventListener('input', function () {
        S.subheadlineColor = slColorEl.value;
        debouncedTextUpdate();
        PP.markDirty();
      });
    }
  };

  /** Pick white or dark text based on current background luminance */
  PP.autoTextColor = function () {
    var dominant;
    if (S.bgType === 'gradient') {
      dominant = Utils.averageHex(S.bgFrom, S.bgTo);
    } else if (S.bgType === 'solid') {
      dominant = S.bgSolid;
    } else if (S.bgType === 'split') {
      dominant = S.bgSplitTop; // headline sits in top half
    } else {
      return;
    }

    var isLight  = Utils.isLight(dominant);
    var color    = isLight ? '#111111' : '#ffffff';
    var subColor = isLight ? '#555555' : '#aaaaaa';
    S.textColor        = color;
    S.subheadlineColor = subColor;
  };

})();
