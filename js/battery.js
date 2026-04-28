// ============================================================
// battery.js — Poll the firmware's battery voltage.
//
// Sends BAT? at 1 Hz once the BLE link is up. Parses the echoed
// reply (expected: "BAT:V" or "BAT:V,pct") and updates the strip.
// If the firmware doesn't implement BAT? the verb just times out,
// the readout stays "—", and we back off to once-every-10s so we
// don't pollute the queue forever.
//
// FIRMWARE TODO (v1-maqueen-lib.ts):
//   bluetooth.onUartDataReceived('?', () => {
//     if (msg.startsWith('BAT?')) {
//       const v = pins.analogReadPin(AnalogPin.P10) / 1024 * 6.6;
//       reply(`BAT:${v.toFixed(2)}`);
//     }
//   });
// ============================================================
(function () {
  'use strict';

  let intervalMs = 1000;
  let timer = null;
  let consecutiveFails = 0;

  function paint(value, pct) {
    const el = document.getElementById('mq-bat');
    const icon = document.getElementById('mq-bat-icon');
    if (!el) return;
    if (value == null) {
      el.textContent = '—';
      el.style.color = 'var(--text-secondary, #93a8c4)';
      if (icon) icon.textContent = '🔋';
      return;
    }
    el.textContent = (pct != null ? pct + '% · ' : '') + value.toFixed(2) + 'V';
    // Color + icon by % (or by voltage if % missing — assume 4xAA NiMH).
    const p = pct != null ? pct
            : value >= 5.6 ? 100
            : value >= 5.0 ? 80
            : value >= 4.6 ? 50
            : value >= 4.2 ? 20
            : 5;
    el.style.color = p > 50 ? '#4ade80' : p > 20 ? '#fbbf24' : '#f87171';
    if (icon) icon.textContent = p > 80 ? '🔋' : p > 30 ? '🔋' : '🪫';
  }

  function poll() {
    if (!window.bleScheduler) return;
    window.bleScheduler.send('BAT?', { coalesce: true })
      .then(({ reply } = {}) => {
        // Reply formats supported:
        //   "BAT:5.81"          → V only
        //   "BAT:5.81,84"       → V,pct
        if (!reply || !reply.startsWith('BAT:')) {
          consecutiveFails++;
          if (consecutiveFails > 4 && intervalMs < 10000) {
            intervalMs = 10000;
            schedule();
          }
          return;
        }
        consecutiveFails = 0;
        if (intervalMs !== 1000) { intervalMs = 1000; schedule(); }
        const parts = reply.slice(4).split(',');
        const v   = +parts[0];
        const pct = parts[1] != null ? +parts[1] : null;
        paint(isNaN(v) ? null : v, isNaN(pct) ? null : pct);
      })
      .catch(() => {
        consecutiveFails++;
        if (consecutiveFails > 4 && intervalMs < 10000) {
          intervalMs = 10000; schedule();
        }
      });
  }
  function schedule() {
    if (timer) clearInterval(timer);
    timer = setInterval(poll, intervalMs);
  }

  function init() {
    if (!document.getElementById('mq-bat')) return;
    if (window.bleScheduler && window.bleScheduler.on) {
      window.bleScheduler.on('connected', () => {
        consecutiveFails = 0;
        intervalMs = 1000;
        poll();
        schedule();
      });
      window.bleScheduler.on('disconnected', () => {
        if (timer) clearInterval(timer);
        timer = null;
        paint(null);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
