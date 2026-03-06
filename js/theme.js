/**
 * Painless Pixels — Theme Manager
 * Toggles light/dark theme with localStorage persistence.
 */
var Theme = (function () {
  'use strict';

  var STORAGE_KEY = 'pp-theme';

  function init() {
    // Apply saved or OS-preferred theme
    var saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      saved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    apply(saved);

    // Wire all toggle buttons
    document.querySelectorAll('.theme-toggle').forEach(function (btn) {
      btn.addEventListener('click', toggle);
    });

    // Listen for OS theme changes (only matters if no saved preference)
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
      if (!localStorage.getItem(STORAGE_KEY)) {
        apply(e.matches ? 'dark' : 'light');
      }
    });
  }

  function apply(theme) {
    document.documentElement.dataset.theme = theme;
    var label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    document.querySelectorAll('.theme-toggle').forEach(function (btn) {
      btn.setAttribute('aria-label', label);
    });
  }

  function toggle() {
    var current = document.documentElement.dataset.theme;
    var next = current === 'dark' ? 'light' : 'dark';
    apply(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  return { init: init, apply: apply, toggle: toggle };
})();
