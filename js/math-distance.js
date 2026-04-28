// ============================================================
// math-distance.js — Game: predict v × t.
//
// Random speed (80..240, BLE units) × random time (1..4 s).
// Expected cm = speed × time × VEL_SCALE where VEL_SCALE = 25/200
// (matches mqOdometry's calibration in maqueen-tab.js).
//
// Two ways to verify:
//   ✓ Check     — score against the formula's analytical answer.
//   🚦 Run it   — drive the robot for the prescribed duration,
//                 read mqOdometry.totalDist delta, score against
//                 the actual distance covered.
//
// 'Run it' is the magic moment: kids see their math predict (or
// fail to predict) reality, with battery droop / wheel slip
// providing real-world reasons their formula is approximate.
// ============================================================
(function () {
  'use strict';

  const KEY_BEST  = 'maqueen.mathBest';
  const VEL_SCALE = 25 / 200;     // cm/s per BLE unit (matches mqOdometry)

  let speed = 0, secs = 0;        // current challenge
  let running = false;

  function rnd(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }

  function newProblem() {
    // Speed in 20-unit steps so the math is round numbers, not 137.
    speed = rnd(4, 12) * 20;        // 80..240
    secs  = rnd(1, 4);
    const expected = (speed * secs * VEL_SCALE).toFixed(1);
    const p = document.getElementById('mqMathProblem');
    if (p) p.textContent =
      `🤔  speed = ${speed},  time = ${secs} s   →   distance = ?  cm`;
    const fb = document.getElementById('mqMathFeedback');
    if (fb) fb.textContent = `hint: 1 unit of speed ≈ 0.125 cm/s`;
    const guess = document.getElementById('mqMathGuess');
    if (guess) { guess.value = ''; guess.focus(); }
    // Stash expected for verification.
    newProblem._expected = +expected;
  }

  function paintBest() {
    let best = 0;
    try { best = +localStorage.getItem(KEY_BEST) || 0; } catch {}
    const el = document.getElementById('mqMathBest');
    if (el) el.textContent = best > 0 ? best + '/100' : '—';
  }

  function score(actual, guess) {
    if (actual <= 0) return 0;
    const err = Math.abs(actual - guess);
    const pct = err / actual * 100;
    return Math.max(0, Math.round(100 - pct));
  }

  function recordBest(s) {
    let best = 0;
    try { best = +localStorage.getItem(KEY_BEST) || 0; } catch {}
    if (s > best) {
      try { localStorage.setItem(KEY_BEST, String(s)); } catch {}
      paintBest();
    }
  }

  function paintFeedback(msg, color) {
    const fb = document.getElementById('mqMathFeedback');
    if (!fb) return;
    fb.textContent = msg;
    fb.style.color = color || 'var(--text-secondary, #93a8c4)';
  }

  function check() {
    const guess = +document.getElementById('mqMathGuess').value;
    if (!guess && guess !== 0) { paintFeedback('type a number first', '#f87171'); return; }
    const expected = newProblem._expected;
    const s = score(expected, guess);
    recordBest(s);
    const emoji = s >= 95 ? '🎯' : s >= 80 ? '✨' : s >= 60 ? '👍' : '📐';
    const color = s >= 80 ? '#4ade80' : s >= 60 ? '#fbbf24' : '#f87171';
    paintFeedback(`${emoji}  formula says ${expected} cm  •  you: ${guess}  •  score ${s}/100`, color);
  }

  async function runIt() {
    if (running) return;
    if (!window.bleScheduler) { paintFeedback('connect the robot to actually drive it', '#fbbf24'); return; }
    if (!window.mqOdometry || !window.mqOdometry.getTotalDist) {
      paintFeedback('odometry not ready', '#f87171'); return;
    }
    running = true;
    const startDist = window.mqOdometry.getTotalDist() || 0;
    paintFeedback(`🚦 driving at ${speed} for ${secs} s…`, '#4ade80');
    try {
      window.bleScheduler.send(`M:${speed},${speed}`).catch(() => {});
      await new Promise(r => setTimeout(r, secs * 1000));
      window.bleScheduler.send('STOP').catch(() => {});
    } catch {}
    // Wait a beat for the last odometry tick.
    await new Promise(r => setTimeout(r, 250));
    const endDist = window.mqOdometry.getTotalDist() || 0;
    const actual  = +(endDist - startDist).toFixed(1);
    const guess   = +(document.getElementById('mqMathGuess').value || 0);
    const expected = newProblem._expected;
    const s = score(actual, guess);
    recordBest(s);
    const color = s >= 80 ? '#4ade80' : s >= 60 ? '#fbbf24' : '#f87171';
    paintFeedback(`🤖 actual ${actual} cm  •  formula ${expected} cm  •  you ${guess}  •  score ${s}/100`, color);
    running = false;
  }

  function init() {
    if (!document.getElementById('mqMathGame')) return;
    paintBest();
    newProblem();
    const c = document.getElementById('mqMathCheck');
    const r = document.getElementById('mqMathRun');
    const n = document.getElementById('mqMathNew');
    const g = document.getElementById('mqMathGuess');
    if (c) c.addEventListener('click', check);
    if (r) r.addEventListener('click', runIt);
    if (n) n.addEventListener('click', newProblem);
    if (g) g.addEventListener('keydown', e => { if (e.key === 'Enter') check(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
