// ============================================================
// heading-lock.js — Compass-corrected heading + Drift Champion game.
//
// Polls the firmware's `HEAD?` verb at 4 Hz once BLE is up. Reply
// arrives as a UART line `HEAD:degrees` (0..360, calibrated compass).
// We listen on bleScheduler's 'reply' event (same pattern as DIST:,
// LINE:, IR:, BAT:).
//
// Three deliverables:
//   1. Live compass heading available as window.mqHeading.get()
//      → consumed by autopilot to correct dead-reckoning drift.
//   2. A "🎯 Drift Champion" game: 60-second drive, scores you on
//      how small the gap between wheel-odometry-heading and the
//      compass-heading stays. Lower drift = higher score. Best score
//      persists.
//   3. A "Heading Lock" toggle on the path card: when ON, autopilot's
//      bearing controller uses compass heading (drift-free) instead
//      of integrated theta. Off → legacy behavior preserved.
//
// FIRMWARE TODO (v1-maqueen-lib.ts):
//   if (msg === 'HEAD?') {
//     // Compass calibration: figure-8 motion at startup
//     const deg = input.compassHeading();
//     replyLine(`HEAD:${deg}`);
//   }
// If the firmware doesn't implement it yet, the readout shows '—'
// and the game tells the user to flash a newer firmware.
// ============================================================
(function () {
  'use strict';

  const KEY_BEST = 'maqueen.driftBest';
  const KEY_LOCK = 'maqueen.headingLock';

  let pollTimer = null;
  let intervalMs = 250;        // 4 Hz
  let lastReplyAt = 0;
  let liveHeadingDeg = null;   // most recent compass reading
  let lockEnabled = false;     // autopilot uses compass when true

  // ---- Game state -------------------------------------------------
  let runActive = false;
  let runEndsAt = 0;
  let driftSamples = [];       // accumulated |heading_compass - heading_wheels|

  function paint(deg) {
    const el = document.getElementById('mq-head');
    const icon = document.getElementById('mq-head-icon');
    if (!el) return;
    if (deg == null) {
      el.textContent = '—';
      el.style.color = 'var(--text-secondary, #93a8c4)';
      if (icon) icon.textContent = '🧭';
      return;
    }
    el.textContent = deg.toFixed(0) + '°';
    // Color by cardinal direction band so kids see N/E/S/W at a glance.
    const cardinal = (deg < 22 || deg >= 338) ? '#4ade80'   // N
                   : (deg <  68)              ? '#fbbf24'   // NE
                   : (deg < 112)              ? '#f87171'   // E
                   : (deg < 158)              ? '#fb923c'   // SE
                   : (deg < 202)              ? '#c084fc'   // S
                   : (deg < 248)              ? '#38bdf8'   // SW
                   : (deg < 292)              ? '#22d3ee'   // W
                                              : '#a3e635';  // NW
    el.style.color = cardinal;
  }

  function onReply(payload) {
    const line = payload && payload.line;
    if (!line || !line.startsWith('HEAD:')) return;
    lastReplyAt = performance.now();
    if (intervalMs !== 250) { intervalMs = 250; schedule(); }
    const v = +line.slice(5);
    if (isNaN(v)) return;
    liveHeadingDeg = v;
    paint(v);
    if (runActive) sampleDrift(v);
  }

  function poll() {
    if (!window.bleScheduler) return;
    const idle = performance.now() - lastReplyAt;
    if (idle > 4000 && intervalMs < 5000) { intervalMs = 5000; schedule(); }
    try { window.bleScheduler.send('HEAD?', { coalesce: true }).catch(() => {}); } catch {}
  }
  function schedule() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(poll, intervalMs);
  }

  // ---- Drift accumulator (for the game) ---------------------------
  function sampleDrift(compassDeg) {
    if (!window.mqOdometry || !window.mqOdometry.getPose) return;
    // Convert wheel-pose theta to 0..360 compass-style. Robot frame:
    // theta=0 means facing +y (forward). We treat that as North = 0°.
    // theta increasing (counter-clockwise from above) = West-bound,
    // matching standard right-hand rule. So compass_from_pose = -theta
    // (mod 360).
    const pose = window.mqOdometry.getPose();
    let wheelDeg = -pose.theta * 180 / Math.PI;
    while (wheelDeg < 0) wheelDeg += 360;
    while (wheelDeg >= 360) wheelDeg -= 360;
    let diff = Math.abs(compassDeg - wheelDeg);
    if (diff > 180) diff = 360 - diff;
    driftSamples.push(diff);
  }

  function tickRunTimer() {
    if (!runActive) return;
    const remaining = Math.max(0, runEndsAt - performance.now());
    const t = document.getElementById('mqDriftTimer');
    if (t) t.textContent = (remaining / 1000).toFixed(1) + ' s';
    if (remaining <= 0) endRun();
  }

  function startRun() {
    if (liveHeadingDeg == null) {
      const fb = document.getElementById('mqDriftFeedback');
      if (fb) fb.textContent = '⚠ no HEAD: replies — flash firmware with HEAD? verb';
      return;
    }
    runActive = true;
    driftSamples = [];
    runEndsAt = performance.now() + 60000;
    const btn = document.getElementById('mqDriftStart');
    if (btn) { btn.textContent = '⏹ stop'; btn.style.background = '#f87171'; }
  }

  function endRun() {
    runActive = false;
    if (!driftSamples.length) {
      const fb = document.getElementById('mqDriftFeedback');
      if (fb) fb.textContent = 'no samples — drive the robot during the run';
      return;
    }
    // Score: 100 - mean drift in degrees, clamped 0..100.
    const meanDrift = driftSamples.reduce((a, b) => a + b, 0) / driftSamples.length;
    const score = Math.max(0, Math.round(100 - meanDrift));
    let best = 0;
    try { best = +localStorage.getItem(KEY_BEST) || 0; } catch {}
    if (score > best) {
      best = score;
      try { localStorage.setItem(KEY_BEST, String(best)); } catch {}
      const bestEl = document.getElementById('mqDriftBest');
      if (bestEl) bestEl.textContent = best + '/100';
    }
    const fb = document.getElementById('mqDriftFeedback');
    if (fb) {
      const emoji = score >= 90 ? '🏆' : score >= 70 ? '✨' : score >= 50 ? '👍' : '📐';
      fb.style.color = score >= 70 ? '#4ade80' : score >= 50 ? '#fbbf24' : '#f87171';
      fb.textContent = `${emoji}  mean drift ${meanDrift.toFixed(1)}°  ·  score ${score}/100  ·  best ${best}`;
    }
    const btn = document.getElementById('mqDriftStart');
    if (btn) { btn.textContent = '▶ 60 s run'; btn.style.background = '#fbbf24'; }
  }

  // ---- Heading Lock toggle (autopilot integration) ----------------
  function setLock(on) {
    lockEnabled = !!on;
    try { localStorage.setItem(KEY_LOCK, on ? '1' : '0'); } catch {}
    const btn = document.getElementById('mqHeadLockBtn');
    if (btn) {
      btn.classList.toggle('mq-headlock-on', lockEnabled);
      btn.textContent = lockEnabled ? '🎚 LOCK' : '🎚 lock';
    }
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
    window.bleScheduler.on('reply', onReply);
    window.bleScheduler.on('connected', () => {
      lastReplyAt = performance.now();
      intervalMs = 250;
      poll();
      schedule();
    });
    window.bleScheduler.on('disconnected', () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      liveHeadingDeg = null;
      paint(null);
    });
    // Wire the game UI if present.
    const startBtn = document.getElementById('mqDriftStart');
    if (startBtn) startBtn.addEventListener('click', () => runActive ? endRun() : startRun());
    const lockBtn = document.getElementById('mqHeadLockBtn');
    if (lockBtn) lockBtn.addEventListener('click', () => setLock(!lockEnabled));
    try { setLock(localStorage.getItem(KEY_LOCK) === '1'); } catch {}
    // Game timer ticker
    setInterval(tickRunTimer, 200);
    const bestEl = document.getElementById('mqDriftBest');
    if (bestEl) {
      let best = 0;
      try { best = +localStorage.getItem(KEY_BEST) || 0; } catch {}
      bestEl.textContent = best > 0 ? best + '/100' : '—';
    }
  }

  // Public read API for autopilot consumption.
  window.mqHeading = {
    get: () => liveHeadingDeg,
    isLocked: () => lockEnabled,
    isFresh: () => liveHeadingDeg != null && (performance.now() - lastReplyAt) < 1000,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
