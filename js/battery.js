// ============================================================
// battery.js — Poll the firmware's battery voltage.
//
// Sends BAT? at 1 Hz once the BLE link is up. The reply lands on
// the scheduler's 'reply' event as a UART line "BAT:V" or
// "BAT:V,pct" — same convention as DIST: / LINE: / IR:. We listen
// there for the parsed value rather than awaiting send()'s return,
// because send() resolves on echo with { seq, verb, latency } and
// the actual data line arrives on a separate reply event.
//
// If the firmware doesn't implement BAT? the request just gets
// echoed-and-ignored (no BAT: reply ever arrives). We back off to
// once-per-10-seconds so older firmware doesn't pollute the queue.
//
// FIRMWARE TODO (v1-maqueen-lib.ts):
//   if (msg === 'BAT?') {
//     const v = pins.analogReadPin(AnalogPin.P10) / 1024 * 6.6;
//     replyLine(`BAT:${v.toFixed(2)}`);
//   }
// ============================================================
(function () {
  'use strict';

  let intervalMs = 1000;
  let pollTimer  = null;
  let lastReplyAt = 0;

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
    if (icon) icon.textContent = p > 30 ? '🔋' : '🪫';
  }

  function onReply(payload) {
    const line = payload && payload.line;
    if (!line || !line.startsWith('BAT:')) return;
    lastReplyAt = performance.now();
    // Reset to fast cadence — firmware is alive and answering.
    if (intervalMs !== 1000) { intervalMs = 1000; schedule(); }
    const parts = line.slice(4).split(',');
    const v   = +parts[0];
    const pct = parts[1] != null ? +parts[1] : null;
    paint(isNaN(v) ? null : v, isNaN(pct) ? null : pct);
  }

  function poll() {
    if (!window.bleScheduler) return;
    // If we sent a few BAT?s with no replies, the firmware likely doesn't
    // support the verb — back off to once every 10 s to be a good citizen.
    const idle = performance.now() - lastReplyAt;
    if (idle > 8000 && intervalMs < 10000) { intervalMs = 10000; schedule(); }
    try {
      window.bleScheduler.send('BAT?', { coalesce: true }).catch(() => {});
    } catch {}
  }
  function schedule() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(poll, intervalMs);
  }

  function init() {
    if (!document.getElementById('mq-bat')) return;
    if (!window.bleScheduler || !window.bleScheduler.on) {
      // Scheduler not ready yet — retry briefly.
      let tries = 0;
      const id = setInterval(() => {
        if (window.bleScheduler && window.bleScheduler.on) {
          clearInterval(id); init();
        } else if (++tries > 20) clearInterval(id);
      }, 200);
      return;
    }
    window.bleScheduler.on('reply', onReply);
    window.bleScheduler.on('connected', () => {
      lastReplyAt = performance.now();
      intervalMs = 1000;
      poll();
      schedule();
    });
    window.bleScheduler.on('disconnected', () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      paint(null);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
