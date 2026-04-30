// ============================================================
// settings-help-inline.js — wire the bottom-of-page inline
// Settings + Help <details> sections.
//
// The HTML for both sections is in index.html (no JS needed for
// the open/close state — that's <details> built-in). This module
// just wires the radio buttons to the mqSweepMode + mqDensity APIs
// and keeps the capability badge fresh.
// ============================================================
(function () {
  'use strict';

  function paintCapBadgeInline() {
    const el = document.getElementById('mqSettingsSweepCapInline');
    if (!el || !window.mqSweepMode) return;
    const caps = window.mqSweepMode.getCapabilities();
    if (!caps.length) {
      el.textContent = '— firmware caps unknown —';
      el.style.color = '#94a3b8';
    } else if (caps.indexOf('sweep') !== -1) {
      el.textContent = '✓ firmware supports SWEEP:';
      el.style.color = '#4ade80';
    } else {
      el.textContent = '✗ firmware lacks sweep — auto falls back to Browser';
      el.style.color = '#fbbf24';
    }
  }

  function syncRadios() {
    if (window.mqSweepMode) {
      const cur = window.mqSweepMode.getMode();
      document.querySelectorAll('input[name="sweepModeInline"]').forEach(r => {
        r.checked = (r.value === cur);
      });
    }
    if (window.mqDensity) {
      const cur = window.mqDensity.current();
      document.querySelectorAll('input[name="densityModeInline"]').forEach(r => {
        r.checked = (r.value === cur);
      });
    }
  }

  function init() {
    // Wire sweep-mode radios
    document.querySelectorAll('input[name="sweepModeInline"]').forEach(r => {
      r.addEventListener('change', (e) => {
        if (window.mqSweepMode) window.mqSweepMode.set(e.target.value);
        paintCapBadgeInline();
      });
    });
    // Wire density radios
    document.querySelectorAll('input[name="densityModeInline"]').forEach(r => {
      r.addEventListener('change', (e) => {
        if (window.mqDensity) window.mqDensity.apply(e.target.value);
      });
    });
    // Initial state + periodic refresh of cap badge (capability arrives
    // async after the FW? probe completes).
    syncRadios();
    paintCapBadgeInline();
    setInterval(paintCapBadgeInline, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
