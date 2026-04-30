// ============================================================
// sweep-mode.js — Capability detection + dispatch for sweep.
//
// Two paths to sweep:
//   • Browser-mode (local) — JS animates the angle, sends SRV:
//     every ~85 ms. Works on ANY firmware. Subject to BLE latency.
//   • Firmware-mode  — one SWEEP:port,from,to,period,ease command,
//     micro:bit runs the motion at 50 Hz locally and pushes
//     SWP:port,angle back at ~20 Hz so visuals stay in sync.
//     Smoother, but needs firmware that advertises 'sweep' in FW?.
//
// User preference (localStorage.maqueen.sweepMode):
//   'auto'     → use firmware if advertised, else local. (default)
//   'browser'  → always local
//   'firmware' → always firmware (errors out gracefully if absent)
//
// The capability is auto-detected via 'FW?' on connect — reply is
// 'FW:version,cap1,cap2,...'. Cached until disconnect.
//
// Public API:
//   window.mqSweepMode.shouldUseFirmware()  → bool
//   window.mqSweepMode.set('auto'|'browser'|'firmware')
//   window.mqSweepMode.getMode()
//   window.mqSweepMode.getCapabilities()
//   window.mqSweepMode.onSWP(fn)   // subscribe to SWP: position pushes
// ============================================================
(function () {
  'use strict';

  const KEY = 'maqueen.sweepMode';
  let mode = 'auto';
  let firmwareCaps = [];                // populated from FW: reply
  const swpListeners = [];

  try { mode = localStorage.getItem(KEY) || 'auto'; } catch {}

  function set(newMode) {
    if (!['auto', 'browser', 'firmware'].includes(newMode)) return;
    mode = newMode;
    try { localStorage.setItem(KEY, newMode); } catch {}
  }

  function getMode() { return mode; }
  function getCapabilities() { return firmwareCaps.slice(); }

  function shouldUseFirmware() {
    if (mode === 'browser')  return false;
    if (mode === 'firmware') return true;          // user override
    return firmwareCaps.indexOf('sweep') !== -1;   // 'auto'
  }

  // SWP push handler: on each SWP:port,angle line, broadcast to
  // any subscriber. Sweep-driver UI (sliders, dial, radar) hooks
  // this to follow the truth from the robot.
  function onSWP(fn) {
    if (typeof fn === 'function') swpListeners.push(fn);
  }
  function emitSWP(port, angle) {
    for (const fn of swpListeners) {
      try { fn(port, angle); } catch {}
    }
  }

  // Probe firmware capabilities once per connection.
  function probe() {
    if (!window.bleScheduler) return;
    try {
      window.bleScheduler.send('FW?', { coalesce: true }).catch(() => {});
    } catch {}
    // Reply parsing is in the 'reply' listener below.
  }

  function init() {
    if (!window.bleScheduler || !window.bleScheduler.on) {
      let tries = 0;
      const id = setInterval(() => {
        if (window.bleScheduler && window.bleScheduler.on) {
          clearInterval(id); init();
        } else if (++tries > 20) clearInterval(id);
      }, 200);
      return;
    }
    window.bleScheduler.on('reply', (payload) => {
      const line = payload && payload.line;
      if (!line) return;
      // 'FW:0.2.1-bare,sweep,head,bat,...' → cache caps
      if (line.startsWith('FW:')) {
        firmwareCaps = line.slice(3).split(',').slice(1).map(s => s.trim());
        return;
      }
      // 'SWP:port,angle' → forward to subscribers
      if (line.startsWith('SWP:')) {
        const m = line.slice(4).split(',');
        const port = +m[0], angle = +m[1];
        if (!isNaN(port) && !isNaN(angle)) emitSWP(port, angle);
      }
    });
    window.bleScheduler.on('connected', () => {
      firmwareCaps = [];
      // Probe once the link is up. Slight delay so the scheduler is settled.
      setTimeout(probe, 200);
    });
    window.bleScheduler.on('disconnected', () => {
      firmwareCaps = [];
    });
  }

  window.mqSweepMode = {
    shouldUseFirmware, set, getMode, getCapabilities, onSWP,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
