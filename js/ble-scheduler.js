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
    // ANY received line proves the BLE link is up. Covers two cases the
    // explicit signals miss: (a) INFO:CONNECTED was emitted before our
    // UART hook was installed, and (b) bit-playground's auto-HELLO on
    // connect is echoed back as a bare 'ECHO HELLO' (no seq), which the
    // ECHO:N regex below doesn't match. Without this fallback the
    // scheduler thinks it's offline and rejects every drive command.
    if (!_connected) { _connected = true; emit('connected', {}); }
    if (line === 'INFO:CONNECTED') {
      // already handled above; just consume
      return;
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
      // Coalesce: if a same-prefix verb is already queued, replace it.
      // The OLD queued entry is rejected with 'coalesced'. Its scheduled
      // flush timer is cleared so we don't stack zombies that fire and
      // race the replacement.
      const prefix = verbPrefix(verb);
      if (opts.coalesce && coalesce.has(prefix)) {
        const old = coalesce.get(prefix);
        if (old.flushTimer) clearTimeout(old.flushTimer);
        try { old.reject(new Error('coalesced')); } catch {}
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
        const entry = { resolve, reject, verb, flushTimer: null };
        coalesce.set(prefix, entry);
        entry.flushTimer = scheduleCoalesceFlush(prefix, bucket);
        return;
      }
      dispatch(verb, resolve, reject);
      if (bucket) bucket.last = now;
    });
  }

  function scheduleCoalesceFlush(prefix, bucket) {
    const due = bucket.minIntervalMs - (performance.now() - bucket.last);
    return setTimeout(() => {
      const queued = coalesce.get(prefix);
      if (!queued) return;
      coalesce.delete(prefix);
      bucket.last = performance.now();
      // dispatch may itself reject (e.g. disconnected). The promise can
      // only settle once, so a no-op double-reject is harmless.
      dispatch(queued.verb, queued.resolve, queued.reject);
    }, Math.max(0, due));
  }

  // Global write serializer — Web Bluetooth's GATT only permits ONE
  // writeValue at a time. We delegate the actual write to bit-playground's
  // sendLine (which sees the writeChar / isConnected globals that core.js
  // owns) but AWAIT the Promise it now returns, so the next send can't
  // start until the previous one is genuinely complete. Without awaiting
  // the inner writeValue, fast back-to-back sends raised
  //   'NetworkError: GATT operation already in progress'.
  const POST_WRITE_GAP_MS = 5;   // tiny breather between writes
  let writeQueue = Promise.resolve();
  let _origSendLine = null;
  function throttledSend(line) {
    writeQueue = writeQueue
      .then(() => {
        try {
          const ret = _origSendLine ? _origSendLine(line) : null;
          // ret is a Promise (post-fix) or undefined (older ble.js)
          return ret || Promise.resolve();
        } catch (e) { return Promise.resolve(); }
      })
      .then(() => new Promise(r => setTimeout(r, POST_WRITE_GAP_MS)))
      .catch(() => {});
    return writeQueue;
  }

  // Replace global.sendLine so EVERY caller (bit-playground modules and
  // the scheduler's own dispatch) goes through the awaited queue.
  function installSendLineWrapper() {
    if (typeof global.sendLine !== 'function') {
      setTimeout(installSendLineWrapper, 100);
      return;
    }
    if (global.sendLine._maqueenWrapped) return;
    _origSendLine = global.sendLine;
    const wrapped = function (line) { throttledSend(line); };
    wrapped._maqueenWrapped = true;
    global.sendLine = wrapped;
  }
  installSendLineWrapper();

  function dispatch(verb, resolve, reject) {
    if (!global.sendLine) {
      reject(new Error('ble.js not loaded'));
      return;
    }
    // Single chokepoint: drop on the floor if not connected.
    // Auto-stops any running animation (rainbow, sweep) since they can't
    // reach the robot anyway. Also drains the coalesce queue so any
    // promises waiting for a "next slot" don't await indefinitely.
    if (!isConnectedLive()) {
      stopAll();
      flushPendingOnDisconnect();
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
    // Tick semantics:
    //   - returns a non-empty string  → send that verb (rate-limited)
    //   - returns null                → SKIP this tick, keep the animation
    //                                   running (used by sweep dedup to
    //                                   skip same-angle frames without
    //                                   killing the loop)
    //   - returns false / undefined   → STOP the animation
    const tick = () => {
      const t = performance.now() - start;
      const verb = verbFn(t);
      if (verb === false || verb === undefined) { stop(id); return; }
      if (verb === null) return;             // skip-this-tick
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
    // Snapshot keys before iterating — stop() mutates `animations`.
    const ids = Array.from(animations.keys());
    for (const id of ids) stop(id);
  }

  // Reject everything that's mid-flight or queued so callers don't await
  // indefinitely after a disconnect. Run on every disconnect transition.
  function flushPendingOnDisconnect() {
    // Pending sequence-numbered sends — each had a setTimeout for echo
    // timeout; clear those too so they don't double-settle later.
    for (const [seq, p] of pending.entries()) {
      try { clearTimeout(p.timeoutId); } catch {}
      try { p.reject(new Error('disconnected')); } catch {}
    }
    pending.clear();
    // Coalesce queue — promises waiting for a next slot. Clear their
    // flush timers too so they don't fire and dispatch into a closed link.
    for (const [prefix, q] of coalesce.entries()) {
      if (q.flushTimer) { try { clearTimeout(q.flushTimer); } catch {} }
      try { q.reject(new Error('disconnected')); } catch {}
    }
    coalesce.clear();
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
  setRate('SRV', 12);   // servo — 12 Hz = every ~83 ms. Matches the SG90's
                        // physical slew time (~100 ms for a small step).
                        // Higher rates (we tried 20 Hz) cause the servo's
                        // internal PID to be yanked off mid-slew → visible
                        // micro-reversals during sweep. Sweep code samples
                        // the angle at 30 Hz (smooth UI) but only sends a
                        // new SRV: when ~80 ms has elapsed since the last
                        // send, dovetailing with this rate cap.
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
  // True if the BLE link is actually live. Authoritative source is
  // bit-playground's window.isConnected (set in ble.js on GATT connect/
  // disconnect). The internal _connected flag is a secondary signal driven
  // by INFO:CONNECTED / INFO:DISCONNECTED firmware lines — useful for the
  // scheduler's own bookkeeping but NOT trusted on its own (it can stick
  // true across page reloads of state, or lag the actual GATT state).
  //
  // Earlier versions cross-checked the connectBtn.disabled state, but that
  // attribute can be true on page load before the user ever connected,
  // causing the scheduler to think it was connected and dispatch verbs
  // that ble.js then rejected as "TX blocked".
  function isConnectedLive() {
    // Single source of truth: the DOM signal from core.js. core.js sets
    // disconnectBtn.disabled = false on GATT connect, true on disconnect.
    // Falls back to _connected (set by any RX line via intercept) only if
    // the disconnect button is missing.
    const disBtn = document.getElementById('disconnectBtn');
    const live = disBtn ? (disBtn.disabled === false) : _connected;
    if (live && !_connected) {
      _connected = true;
      emit('connected', {});
    }
    if (!live && _connected) {
      _connected = false;
      flushPendingOnDisconnect();
      emit('disconnected', {});
    }
    return live;
  }

  // Drive connection-state transitions via MutationObserver on the
  // disconnect button — so 'connected'/'disconnected' events fire even
  // when nothing is actively polling isConnectedLive(). Subscribers
  // (panel, tab) get notified the moment GATT state flips.
  function installConnectionWatcher() {
    const disBtn = document.getElementById('disconnectBtn');
    if (!disBtn) {
      setTimeout(installConnectionWatcher, 200);
      return;
    }
    isConnectedLive();   // prime the flag
    const obs = new MutationObserver(() => isConnectedLive());
    obs.observe(disBtn, { attributes: true, attributeFilter: ['disabled'] });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installConnectionWatcher);
  } else {
    installConnectionWatcher();
  }

  // Cancel a pending coalesced command for a given verb prefix without
  // dispatching it. Call this before sending STOP so a rate-limited M:
  // queued flush doesn't override the stop ~125 ms later.
  function clearCoalesced(prefix) {
    const q = coalesce.get(prefix);
    if (!q) return;
    if (q.flushTimer) { try { clearTimeout(q.flushTimer); } catch {} }
    try { q.reject(new Error('cancelled')); } catch {}
    coalesce.delete(prefix);
  }

  global.bleScheduler = {
    send, animate, stop, stopAll,
    setRate, clearCoalesced, on, getStats, resetStats,
    isConnected: isConnectedLive,
  };
})(window);
