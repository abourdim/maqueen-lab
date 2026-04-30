// ============================================================
// slam-game.js — Game: SLAM the Room.
//
// Score = number of unique 10×10 cm grid cells the trail visits.
// Live count is always displayed. Pressing 'Start' arms a 60-second
// timed run; the count at T=0 becomes the run's score, and the
// best-ever score persists. Cells are reset when the user clicks
// the existing path 'reset' button.
// ============================================================
(function () {
  'use strict';

  const KEY_BEST = 'maqueen.slamBest';
  const CELL_CM  = 10;            // 10 × 10 cm grid

  // Set of "x,y" cell keys (where x,y are integer cell indices).
  const cells = new Set();
  let runActive = false;
  let runEndsAt = 0;
  let runStartCells = 0;

  function cellKey(p) {
    return Math.floor(p.x / CELL_CM) + ',' + Math.floor(p.y / CELL_CM);
  }

  function paintLive() {
    const c = document.getElementById('mqSlamCells');
    const a = document.getElementById('mqSlamArea');
    if (c) c.textContent = cells.size;
    if (a) a.textContent = ((cells.size * CELL_CM * CELL_CM) / 10000).toFixed(2) + ' m²';
  }
  function paintBest() {
    let best = 0;
    try { best = +localStorage.getItem(KEY_BEST) || 0; } catch {}
    const el = document.getElementById('mqSlamBest');
    if (el) el.textContent = best > 0 ? best : '—';
  }

  function tickFromTrail() {
    if (!window.mqOdometry || !window.mqOdometry.getTrail) return;
    const trail = window.mqOdometry.getTrail();
    // Cheap recompute — trail caps at 600 points so this is fine at 5 Hz.
    cells.clear();
    for (let i = 0; i < trail.length; i++) cells.add(cellKey(trail[i]));
    paintLive();
  }

  function tickRunTimer() {
    if (!runActive) return;
    const remaining = Math.max(0, runEndsAt - performance.now());
    const t = document.getElementById('mqSlamTimer');
    if (t) t.textContent = (remaining / 1000).toFixed(1) + ' s';
    if (remaining <= 0) endRun();
  }

  function startRun() {
    runActive = true;
    runStartCells = cells.size;
    runEndsAt = performance.now() + 60000;
    const btn = document.getElementById('mqSlamStart');
    if (btn) {
      btn.textContent = '⏹ stop';
      btn.style.background = '#f87171';
      btn.style.color = '#1a0e2a';
    }
  }
  function endRun() {
    runActive = false;
    const score = cells.size - runStartCells;
    let best = 0;
    try { best = +localStorage.getItem(KEY_BEST) || 0; } catch {}
    if (score > best) {
      try { localStorage.setItem(KEY_BEST, String(score)); } catch {}
      paintBest();
    }
    const t = document.getElementById('mqSlamTimer');
    if (t) t.textContent = `done · +${score} cells`;
    const btn = document.getElementById('mqSlamStart');
    if (btn) {
      btn.textContent = '▶ 60 s run';
      btn.style.background = '#00d4ff';
      btn.style.color = '#01202b';
    }
  }

  function init() {
    if (!document.getElementById('mqSlamBar')) return;
    paintBest();
    paintLive();
    const btn = document.getElementById('mqSlamStart');
    if (btn) btn.addEventListener('click', () => runActive ? endRun() : startRun());
    // Hook the existing 'reset' button to also clear our cell set.
    const reset = document.getElementById('mqOdoReset');
    if (reset) reset.addEventListener('click', () => {
      cells.clear();
      paintLive();
    });
    // Update at 5 Hz — much cheaper than tying into the 60 Hz odometry
    // tick, and any sub-second SLAM scoring would feel jittery anyway.
    setInterval(() => { tickFromTrail(); tickRunTimer(); }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
