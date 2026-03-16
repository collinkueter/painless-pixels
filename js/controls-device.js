/**
 * Painless Pixels — Device Picker Controls
 *
 * Wires form-factor toggle and device select dropdown.
 * Subscribes to State for auto-sync (replaces syncDevicePicker).
 */
(function () {
  'use strict';

  var S = PP.State;

  function populateDeviceSelect(formFactor) {
    var deviceSelect = Utils.$('#device-select');
    var devices = Devices.FORM_DEVICES[formFactor] || [];
    deviceSelect.innerHTML = '';
    devices.forEach(function (d) {
      var opt = document.createElement('option');
      opt.value = d;
      opt.textContent = Devices.DEVICE_LABELS[d];
      deviceSelect.appendChild(opt);
    });
  }

  PP.wireDevicePicker = function () {
    var deviceSelect = Utils.$('#device-select');

    // ── Subscription (replace syncDevicePicker) ─────────────────────
    S._subscribe('activeDevice', function (val) {
      var currentFactor = Devices.FORM_FACTOR[val] || 'phone';

      // Update toggle buttons
      Utils.$$('.form-factor-btn').forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.factor === currentFactor);
        btn.setAttribute('aria-pressed', btn.dataset.factor === currentFactor ? 'true' : 'false');
      });

      populateDeviceSelect(currentFactor);
      deviceSelect.value = val;
    });

    // ── Event listeners ─────────────────────────────────────────────

    // Form factor toggle
    Utils.$$('.form-factor-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var factor = btn.dataset.factor;
        Utils.$$('.form-factor-btn').forEach(function (b) {
          b.classList.toggle('active', b.dataset.factor === factor);
          b.setAttribute('aria-pressed', b.dataset.factor === factor ? 'true' : 'false');
        });
        populateDeviceSelect(factor);
        PP.switchToDevice(deviceSelect.value);
      });
    });

    deviceSelect.addEventListener('change', function () {
      PP.switchToDevice(deviceSelect.value);
    });

    // Initial population (trigger subscription manually for current value)
    var currentFactor = Devices.FORM_FACTOR[S.activeDevice] || 'phone';
    Utils.$$('.form-factor-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.factor === currentFactor);
      btn.setAttribute('aria-pressed', btn.dataset.factor === currentFactor ? 'true' : 'false');
    });
    populateDeviceSelect(currentFactor);
    deviceSelect.value = S.activeDevice;
  };

  PP.switchToDevice = function (device) {
    if (device === S.activeDevice) return;

    // Save current slide state before switching
    PP.syncActiveSlide();

    S.activeDevice = device;

    Editor.switchDevice(device);

    // Same slides, just re-render with the new device frame
    PP.renderSlideList();
    if (S.slides.length) {
      PP.loadActiveSlide();
    }
    PP.renderCanvasStrip();

    PP.updateSlideAspectRatio();
    PP.updateExportCounts();
    PP.markDirty();
  };

  PP.updateSlideAspectRatio = function () {
    var design = Devices.DESIGN[S.activeDevice];
    Utils.$$('.slide-item').forEach(function (el) {
      el.style.aspectRatio = design.w + ' / ' + design.h;
    });
  };

})();
