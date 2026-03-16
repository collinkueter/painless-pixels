/**
 * Painless Pixels — Layout Controls
 *
 * Wires angle inputs and reset button. Subscribes to State for auto-sync.
 */
(function () {
  'use strict';

  var S = PP.State;

  PP.wireLayoutControls = function () {
    var phoneAngleInput = Utils.$('#phone-angle');
    var hlAngleInput    = Utils.$('#headline-angle');
    var slAngleInput    = Utils.$('#subline-angle');
    var resetBtn        = Utils.$('#reset-layout-btn');

    // ── Subscriptions (replace syncLayoutControls) ──────────────────
    if (phoneAngleInput) {
      S._subscribe('phoneAngle', function (val) {
        phoneAngleInput.value = val || 0;
      });
    }
    if (hlAngleInput) {
      S._subscribe('headlineAngle', function (val) {
        hlAngleInput.value = val || 0;
      });
    }
    if (slAngleInput) {
      S._subscribe('subheadlineAngle', function (val) {
        slAngleInput.value = val || 0;
      });
    }

    // ── Event listeners ─────────────────────────────────────────────
    if (phoneAngleInput) {
      phoneAngleInput.addEventListener('input', function () {
        S.phoneAngle = parseInt(phoneAngleInput.value, 10) || 0;
        Editor.setPhoneAngle(S.phoneAngle);
        PP.markDirty();
      });
    }

    if (hlAngleInput) {
      hlAngleInput.addEventListener('input', function () {
        S.headlineAngle = parseInt(hlAngleInput.value, 10) || 0;
        Editor.setHeadlineAngle(S.headlineAngle);
        PP.markDirty();
      });
    }

    if (slAngleInput) {
      slAngleInput.addEventListener('input', function () {
        S.subheadlineAngle = parseInt(slAngleInput.value, 10) || 0;
        Editor.setSublineAngle(S.subheadlineAngle);
        PP.markDirty();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        PP.resetLayoutOverrides();
        PP.applyCurrentTemplate();
        PP.markDirty();
      });
    }
  };

  PP.resetLayoutOverrides = function () {
    S._batch(function () {
      S.phoneXFrac       = null;
      S.phoneYFrac       = null;
      S.phoneAngle       = 0;
      S.headlineXFrac    = null;
      S.headlineYFrac    = null;
      S.headlineAngle    = 0;
      S.subheadlineXFrac = null;
      S.subheadlineYFrac = null;
      S.subheadlineAngle = 0;
    });
  };

  PP.getLayoutOverrides = function () {
    return {
      phoneXFrac:       S.phoneXFrac,
      phoneYFrac:       S.phoneYFrac,
      phoneAngle:       S.phoneAngle,
      headlineXFrac:    S.headlineXFrac,
      headlineYFrac:    S.headlineYFrac,
      headlineAngle:    S.headlineAngle,
      subheadlineXFrac: S.subheadlineXFrac,
      subheadlineYFrac: S.subheadlineYFrac,
      subheadlineAngle: S.subheadlineAngle,
    };
  };

})();
