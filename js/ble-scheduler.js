// ============================================================
// ble-scheduler.js — Maqueen Lab
//
// Layer ON TOP of the existing js/ble.js (which is reused
// unchanged from bit-playground). Adds:
//   • Sequence numbers + echo-confirmed round-trips
//   • Per-verb coalescing (latest-value-wins for fast slider drags)
//   • Rate limiting (caps cmd/sec to BLE-friendly throughput)
//   • Animation registry (frame fn → BLE-rate dispatch)
//   • Bench meter (sent / echoed / lost / avg latency)
//
// CRITICAL: This module never modifies sendLine() or any other
// ble.js primitive. It only calls them. The handleUartLine
// hook is added by wrapping (not editing) the existing function.
// ============================================================

(function (global) {
  'use strict';

  const ECHO_TIMEOUT_MS = 1500;
  const DEFAULT_RATE_HZ = 8;          // safe BLE UART throughput

  // ---- state ----
  let nextSeq = 1;
  const pending = new Map();          // seq → { verb, ts, resolve, reject, timeoutId }
  const coalesce = new Map();         // verb-prefix → latest pending arg
  const rateBuckets = new Map();      // verb-prefix → { last: ts, minIntervalMs }
  const animations = new Map();       // id → { verb, frame, intervalMs, timer }

  let stats = { sent: 0, echoed: 0, lost: 0, latencySum: 0, latencyCount: 0 };
  const listeners = { echo: [], reply: [], err: [], stats: [] };

  // ---------------------------------------------------------------
  // Hook into existing UART line dispatcher (bit-playground's
  // handleUartLine in js/sensors.js). We wrap, never replace.
  // ---------------------------------------------------------------
  function installUartHook() {
    const orig = global.handleUartLine;
    if (!orig) {
      // ble.js hasn't booted yet — retry on next tick
      setTimeout(installUartHook, 100);
      return;
    }
    if (orig._maqueenWrapped) return;

    const wrapped = function (line) {
      try { intercept(line); } catch (e) { console.error('[scheduler] intercept error', e); }
      return orig(line);
    };
    wrapped._maqueenWrapped = true;
    global.handleUartLine = wrapped;
  }

  // Tracks BLE connection state — set by INFO:CONNECTED / INFO:DISCONNECTED
  // lines from the firmware. Other modules can read it as
  // window.bleScheduler.isConnected() to gate polling.
  let _connected = false;

  // Match ECHO:N <verb> or ERR:N <reason>
  function intercept(line) {
    if (!line) return;
    if (line === 'INFO:CONNECTED') {
      _connected = true; emit('connected', {}); return;
    }
    if (line === 'INFO:DISCONNECTED') {
      _connected = false; emit('disconnected', {}); return;
    }
    const echoMatch = line.match(/^ECHO:(\d+)\s*(.*)$/);
    if (echoMatch) {
      const seq = parseInt(echoMatch[1]);
      resolvePending(seq, 'echo');
      emit('echo', { seq, verb: echoMatch[2] });
      // First echo from a session also counts as "connected" — covers cases
      // where INFO:CONNECTED arrived before our hook was installed
      if (!_connected) { _connected = true; emit('connected', {}); }
      return;
    }
    const errMatch = line.match(/^ERR:(\d+)\s*(.*)$/);
    if (errMatch) {
      const seq = parseInt(errMatch[1]);
      resolvePending(seq, 'err', errMatch[2]);
      emit('err', { seq, reason: errMatch[2] });
      return;
    }
    // Generic value reply (LINE:l,r, DIST:cm, IR:code, etc.)
    emit('reply', { line });
  }

  function resolvePending(seq, kind, reason) {
    const p = pending.get(seq);
    if (!p) return;
    clearTimeout(p.timeoutId);
    pending.delete(seq);
    if (kind === 'echo') {
      stats.echoed++;
      const latency = performance.now() - p.ts;
      stats.latencySum += latency;
      stats.latencyCount++;
      p.resolve({ seq, verb: p.verb, latency });
    } else {
      p.reject(new Error(reason || 'firmware error'));
    }
    emitStats();
  }

  // ---------------------------------------------------------------
  // Public: send a verb, return a Promise that resolves on echo
  // ---------------------------------------------------------------
  function send(verb, opts) {
    opts = opts || {};
    return new Promise((resolve, reject) => {
      // Coalesce: if a same-prefix verb is already queued, replace it
      const prefix = verbPrefix(verb);
      if (opts.coalesce && coalesce.has(prefix)) {
        const old = coalesce.get(prefix);
        old.reject(new Error('coalesced'));
      }

      // Rate limit
      const bucket = rateBuckets.get(prefix);
      const now = performance.now();
      if (bucket && now - bucket.last < bucket.minIntervalMs) {
        if (!opts.coalesce) {
          reject(new Error('rate-limited'));
          return;
        }
        // coalesce mode: queue for next slot
        coalesce.set(prefix, { resolve, reject, verb });
        scheduleCoalesceFlush(prefix, bucket);
        return;
      }
      dispatch(verb, resolve, reject);
      if (bucket) bucket.last = now;
    });
  }

  function scheduleCoalesceFlush(prefix, bucket) {
    const due = bucket.minIntervalMs - (performance.now() - bucket.last);
    setTimeout(() => {
      const queued = coalesce.get(prefix);
      if (!queued) return;
      coalesce.delete(prefix);
      bucket.last = performance.now();
      dispatch(queued.verb, queued.resolve, queued.reject);
    }, Math.max(0, due));
  }

  // Global write throttle — Web Bluetooth's GATT only permits ONE
  // writeValue at a time. Without serialising, fast back-to-back sends
  // raise 'NetworkError: GATT operation already in progress'.
  // Each call waits MIN_WRITE_GAP_MS after the previous one before
  // hitting sendLine. Acts as both a serializer and a rate cap.
  const MIN_WRITE_GAP_MS = 90;   // ≈ 11 cmd/sec ceiling
  let lastWriteAt = 0;
  let writeQueue = Promise.resolve();
  function throttledSend(line) {
    writeQueue = writeQueue.then(() => {
      const now = performance.now();
      const gap = MIN_WRITE_GAP_MS - (now - lastWriteAt);
      const delay = gap > 0 ? gap : 0;
      return new Promise(r => setTimeout(r, delay)).then(() => {
        lastWriteAt = performance.now();
        try { global.sendLine(line); } catch (e) { /* swallow */ }
      });
    });
  }

  function dispatch(verb, resolve, reject) {
    if (!global.sendLine) {
      reject(new Error('ble.js not loaded'));
      return;
    }
    // Single chokepoint: drop on the floor if not connected.
    // Auto-stops any running animation (rainbow, sweep) since they can't
    // reach the robot anyway.
    if (!isConnectedLive()) {
      stopAll();
      reject(new Error('not connected'));
      return;
    }
    const seq = nextSeq++;
    const line = `#${seq} ${verb}`;
    const timeoutId = setTimeout(() => {
      const p = pending.get(seq);
      if (p) {
        pending.delete(seq);
        stats.lost++;
        emitStats();
        reject(new Error(`echo timeout (#${seq} ${verb})`));
      }
    }, ECHO_TIMEOUT_MS);

    pending.set(seq, { verb, ts: performance.now(), resolve, reject, timeoutId });
    stats.sent++;
    throttledSend(line);
    emitStats();
  }

  function verbPrefix(verb) {
    const colon = verb.indexOf(':');
    return colon > 0 ? verb.substr(0, colon) : verb;
  }

  // ---------------------------------------------------------------
  // Public: set rate limit per verb prefix
  // ---------------------------------------------------------------
  function setRate(prefix, hz) {
    rateBuckets.set(prefix, { last: 0, minIntervalMs: 1000 / hz });
  }

  // ---------------------------------------------------------------
  // Animation registry — repeating verbs at BLE-friendly rate
  // animate(id, verb-fn, hz)
  //   verb-fn(t) → string verb (or null to stop)
  // ---------------------------------------------------------------
  function animate(id, verbFn, hz) {
    stop(id);
    const intervalMs = 1000 / (hz || DEFAULT_RATE_HZ);
    const start = performance.now();
    const tick = () => {
      const t = performance.now() - start;
      const verb = verbFn(t);
      if (verb == null) { stop(id); return; }
      send(verb, { coalesce: true }).catch(() => {});
    };
    const timer = setInterval(tick, intervalMs);
    animations.set(id, { timer });
    tick();
  }

  function stop(id) {
    const a = animations.get(id);
    if (a) { clearInterval(a.timer); animations.delete(id); }
  }

  function stopAll() {
    for (const id of animations.keys()) stop(id);
  }

  // ---------------------------------------------------------------
  // Listeners
  // ---------------------------------------------------------------
  function on(evt, fn) { (listeners[evt] || (listeners[evt] = [])).push(fn); }
  function emit(evt, data) {
    const arr = listeners[evt];
    if (arr) for (const fn of arr) { try { fn(data); } catch (e) { console.error(e); } }
  }
  function emitStats() {
    const s = {
      sent: stats.sent,
      echoed: stats.echoed,
      lost: stats.lost,
      pending: pending.size,
      avgLatencyMs: stats.latencyCount ? Math.round(stats.latencySum / stats.latencyCount) : 0,
    };
    emit('stats', s);
  }
  function getStats() { return { ...stats, pending: pending.size }; }
  function resetStats() {
    stats = { sent: 0, echoed: 0, lost: 0, latencySum: 0, latencyCount: 0 };
    emitStats();
  }

  // ---------------------------------------------------------------
  // Defaults: sensible rate limits for the heavy verbs
  // ---------------------------------------------------------------
  setRate('M', 8);      // motors — joystick drag
  setRate('SRV', 8);    // servo — slider drag
  setRate('RGB', 8);    // RGB animations
  setRate('LED', 30);   // simple LED toggles — fast L+R pairs
  setRate('BUZZ', 5);   // buzzer
  setRate('LINE?', 4);  // line-sensor poll
  setRate('DIST?', 4);  // ultrasonic poll
  setRate('IR?', 4);    // IR poll

  // Boot the UART hook once the page has loaded ble.js + sensors.js
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installUartHook);
  } else {
    installUartHook();
  }

  // ---- export ----
  // True if the BLE link is actually live. Combines:
  //   1. Internal _connected flag (set by INFO:CONNECTED / INFO:DISCONNECTED lines)
  //   2. Bit-playground's connectBtn.disabled === true (its UI flips on connect)
  //   3. Falls back to false if neither signal is positive
  // This is the single source of truth other modules should use.
  function isConnectedLive() {
    if (_connected) {
      // Cross-check with bit-playground's button state — if that says
      // disconnected (browser-side disconnect), trust it and reset.
      const btn = document.getElementById('connectBtn');
      if (btn && btn.disabled === false) {
        _connected = false;
        emit('disconnected', {});
        return false;
      }
      return true;
    }
    // _connected is false — but maybe we missed INFO:CONNECTED. Check button.
    const btn = document.getElementById('connectBtn');
    if (btn && btn.disabled === true) {
      _connected = true;
      emit('connected', {});
      return true;
    }
    return false;
  }

  global.bleScheduler = {
    send, animate, stop, stopAll,
    setRate, on, getStats, resetStats,
    isConnected: isConnectedLive,
  };
})(window);
