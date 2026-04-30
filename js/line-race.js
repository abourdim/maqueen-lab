// ============================================================
// line-race.js — Game: Line Follower Race stopwatch.
//
// Pure timer. The kid prints a track, clicks Start when the
// robot crosses the start line, clicks Lap when it finishes.
// Best lap persists. Multiple laps stack so kids see if they're
// improving or fading. ~70 LOC.
// ============================================================
(function () {
  'use strict';

  const KEY_BEST = 'maqueen.raceBest';

  let startedAt = 0;
  let running   = false;
  let raf       = null;
  const laps    = [];

  function tick() {
    if (!running) return;
    const elapsed = (performance.now() - startedAt) / 1000;
    const c = document.getElementById('mqRaceClock');
    if (c) c.textContent = elapsed.toFixed(2) + ' s';
    raf = requestAnimationFrame(tick);
  }

  function fmt(s)  { return s.toFixed(2) + ' s'; }

  function paintBest() {
    let best = 0;
    try { best = +localStorage.getItem(KEY_BEST) || 0; } catch {}
    const el = document.getElementById('mqRaceBest');
    if (el) el.textContent = best > 0 ? fmt(best) : '—';
  }
  function paintLaps() {
    const el = document.getElementById('mqRaceLaps');
    if (!el) return;
    if (!laps.length) { el.textContent = ''; return; }
    el.innerHTML = laps.map((s, i) => {
      const fastest = laps.indexOf(Math.min(...laps));
      const tag = i === fastest ? ' ⚡' : '';
      return `lap ${i + 1}: <b style="color:#4ade80;">${fmt(s)}</b>${tag}`;
    }).join('  ·  ');
  }

  function start() {
    startedAt = performance.now();
    running   = true;
    tick();
    const btn = document.getElementById('mqRaceStart');
    if (btn) { btn.textContent = '⏸ Stop'; btn.style.background = '#f87171'; }
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    const btn = document.getElementById('mqRaceStart');
    if (btn) { btn.textContent = '▶ Start'; btn.style.background = '#4ade80'; }
  }
  function lap() {
    if (!running) return;
    const t = (performance.now() - startedAt) / 1000;
    laps.push(t);
    let best = 0;
    try { best = +localStorage.getItem(KEY_BEST) || 0; } catch {}
    if (!best || t < best) {
      best = t;
      try { localStorage.setItem(KEY_BEST, String(best)); } catch {}
      paintBest();
    }
    paintLaps();
    // Auto-restart the clock for the next lap so multi-lap timing is one-handed.
    startedAt = performance.now();
  }
  function reset() {
    stop();
    laps.length = 0;
    paintLaps();
    const c = document.getElementById('mqRaceClock');
    if (c) c.textContent = '0.00 s';
  }

  function init() {
    if (!document.getElementById('mqLineRace')) return;
    paintBest();
    document.getElementById('mqRaceStart').addEventListener('click', () => running ? stop() : start());
    document.getElementById('mqRaceLap'  ).addEventListener('click', lap);
    document.getElementById('mqRaceReset').addEventListener('click', reset);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
