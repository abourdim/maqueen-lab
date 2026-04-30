// ============================================================
// personality.js — Robot personality presets.
//
// One-tap bundle that re-configures the cockpit to a different
// "character". Pure config layer — no firmware changes, no new
// state. Each preset is a map of `inputId → value`; we set the
// .value, dispatch 'input', and let the existing listeners
// (persistence, paint, sweep wiring, etc.) handle everything
// downstream. Idempotent and safe to spam.
//
// Persisted in localStorage.maqueen.personality so the chosen
// character survives a reload (the active chip lights up on next
// page open, even though the underlying inputs already re-read
// their own persisted values from the previous apply).
// ============================================================
(function () {
  'use strict';

  const KEY = 'maqueen.personality';

  // Each preset bundles:
  //   speed         — mqSpeedSlider, 50..255
  //   wanderObst    — mqWanderObstacle, 10..80 cm
  //   sweepPeriod   — mqServoSweepSpeed, in ms (full back-and-forth)
  //   sweepFrom/To  — mqServoSweepFrom/To, 0..180°
  // The audio toggle isn't strictly part of personality; we leave it
  // alone so the user's preference survives character swaps.
  const PRESETS = {
    speedy: {
      speed: 240, wanderObst: 15,
      sweepPeriod: 1200, sweepFrom: 0,  sweepTo: 180,
    },
    cautious: {
      speed: 110, wanderObst: 45,
      sweepPeriod: 4000, sweepFrom: 60, sweepTo: 120,
    },
    curious: {
      speed: 180, wanderObst: 25,
      sweepPeriod: 2500, sweepFrom: 0,  sweepTo: 180,
    },
    lazy: {
      speed: 90,  wanderObst: 55,
      sweepPeriod: 5500, sweepFrom: 60, sweepTo: 120,
    },
  };

  // Set an input's value AND fire 'input' so existing listeners
  // (persist, paint readout, update wedge highlights, etc.) react
  // exactly as if the user had moved the slider themselves.
  function setRange(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    // Use setAttribute too — some browser engines (Firefox) don't
    // refresh draggable thumb position from property assignment alone.
    el.setAttribute('value', String(value));
    el.value = String(value);
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function paintActive(name) {
    document.querySelectorAll('.mq-personality-btn').forEach(b => {
      b.classList.toggle('mq-personality-active', b.dataset.personality === name);
    });
  }

  function apply(name) {
    const p = PRESETS[name];
    if (!p) return;
    setRange('mqSpeedSlider',      p.speed);
    setRange('mqWanderObstacle',   p.wanderObst);
    setRange('mqServoSweepSpeed',  p.sweepPeriod);
    setRange('mqServoSweepFrom',   p.sweepFrom);
    setRange('mqServoSweepTo',     p.sweepTo);
    try { localStorage.setItem(KEY, name); } catch {}
    paintActive(name);
    // Visible confirmation — kid taps a chip, briefly nudges the chip
    // for tactile feedback. The existing CSS :active scale handles the
    // press; here we just light up the new active state.
  }

  function init() {
    const buttons = document.querySelectorAll('.mq-personality-btn');
    if (!buttons.length) return;
    buttons.forEach(b => {
      b.addEventListener('click', () => apply(b.dataset.personality));
    });
    // Restore saved selection on load — only paint the chip; do NOT
    // re-apply, because the underlying inputs already restored their
    // own persisted values. Re-applying would override any tweaks
    // the user made after the last personality pick.
    try {
      const saved = localStorage.getItem(KEY);
      if (saved && PRESETS[saved]) paintActive(saved);
    } catch {}
  }

  // Expose for power-users / tests.
  window.mqPersonality = { apply, PRESETS };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
