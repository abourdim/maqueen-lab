// ============================================================
// pwm-lab.js — Game: hit the target servo angle.
//
// Random target ∈ [10, 170], kid drags the guess slider, submits.
// Score = 100 − |target − guess|, capped at 100. Best score persists.
// If the robot is connected, the guess physically moves S1 so the
// kid sees their answer execute. Teaches: slider position = pulse
// width = real-world angle. ~80 LOC.
// ============================================================
(function () {
  'use strict';

  const KEY_BEST = 'maqueen.pwmLabBest';

  let target = null;
  let attempts = 0;

  function rnd(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }

  function pickTarget() {
    target = rnd(10, 170);
    const t = document.getElementById('mqPwmTarget');
    if (t) t.textContent = target;
    const fb = document.getElementById('mqPwmFeedback');
    if (fb) fb.textContent = '';
    attempts = 0;
  }

  function paintBest() {
    const el = document.getElementById('mqPwmBest');
    if (!el) return;
    let best = 0;
    try { best = +localStorage.getItem(KEY_BEST) || 0; } catch {}
    el.textContent = best > 0 ? best + '/100' : '—';
  }

  function paintGuess() {
    const slider = document.getElementById('mqPwmGuess');
    const read   = document.getElementById('mqPwmGuessRead');
    if (slider && read) read.textContent = slider.value + '°';
  }

  function moveServoS1(angle) {
    // Best-effort: move the real S1 horn so the guess is felt.
    // Silent if BLE isn't ready — the score still works either way.
    try {
      if (window.bleScheduler) {
        window.bleScheduler.send(`SRV:1,${angle}`, { coalesce: true }).catch(() => {});
      }
    } catch {}
  }

  function submit() {
    if (target == null) return;
    const slider = document.getElementById('mqPwmGuess');
    const guess  = +slider.value;
    moveServoS1(guess);
    const err   = Math.abs(target - guess);
    const score = Math.max(0, 100 - err);
    attempts++;
    // Best score = highest single-attempt accuracy across all sessions.
    let best = 0;
    try { best = +localStorage.getItem(KEY_BEST) || 0; } catch {}
    if (score > best) {
      best = score;
      try { localStorage.setItem(KEY_BEST, String(best)); } catch {}
      paintBest();
    }
    const fb = document.getElementById('mqPwmFeedback');
    if (fb) {
      const emoji = score >= 95 ? '🎯' : score >= 80 ? '✨' : score >= 60 ? '👍' : '📐';
      fb.style.color = score >= 80 ? '#4ade80' : score >= 60 ? '#fbbf24' : '#f87171';
      fb.textContent = `${emoji}  off by ${err}°  •  score ${score}/100  •  attempt ${attempts}`;
    }
    // After a strong hit (≥90), auto-advance to a fresh round so the
    // game keeps moving. Weaker scores let the kid try again with the
    // same target — closing in on it teaches PWM resolution.
    if (score >= 90) setTimeout(pickTarget, 1200);
  }

  function init() {
    if (!document.getElementById('mqPwmLab')) return;
    paintBest();
    pickTarget();
    paintGuess();
    const slider = document.getElementById('mqPwmGuess');
    if (slider) slider.addEventListener('input', paintGuess);
    const submitBtn = document.getElementById('mqPwmSubmit');
    if (submitBtn) submitBtn.addEventListener('click', submit);
    const resetBtn  = document.getElementById('mqPwmReset');
    if (resetBtn) resetBtn.addEventListener('click', pickTarget);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
