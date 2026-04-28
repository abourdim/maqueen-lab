// ============================================================
// simon-says.js — Game: 4 colored pads, growing color sequence.
//
// 4 pads = red / green / blue / yellow. Each round adds one random
// pad to the sequence. App plays it back, kid taps in order. One
// wrong tap = game over, score = sequence length reached.
//
// If the robot is connected, every pad flash also drives the real
// 4 onboard NeoPixels via the existing RGB:i,r,g,b verb so the
// sequence happens on both screen and hardware. Otherwise the
// on-screen pads carry the game alone.
// ============================================================
(function () {
  'use strict';

  const KEY_BEST = 'maqueen.simonBest';

  // Pad index → (display color, accompanying tone Hz). Tone gives
  // each pad an audible identity, helping memory.
  const PADS = [
    { hex: '#ef4444', rgb: [255,  0,  0], hz: 440 }, // red    A4
    { hex: '#4ade80', rgb: [  0,255,  0], hz: 554 }, // green  C#5
    { hex: '#38bdf8', rgb: [  0,160,255], hz: 659 }, // blue   E5
    { hex: '#fbbf24', rgb: [255,180,  0], hz: 784 }, // yellow G5
  ];

  let sequence = [];
  let userIdx  = 0;
  let playing  = false;     // app is playing the sequence (input locked)
  let alive    = false;

  let ac = null;
  function tone(hz, durMs) {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    } catch { return; }
    if (!ac) return;
    const t0 = ac.currentTime;
    const t1 = t0 + durMs / 1000;
    const osc = ac.createOscillator();
    const g   = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = hz;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.16, t0 + 0.01);
    g.gain.setValueAtTime(0.16, t1 - 0.02);
    g.gain.linearRampToValueAtTime(0, t1);
    osc.connect(g).connect(ac.destination);
    osc.start(t0); osc.stop(t1 + 0.02);
  }

  function lightUp(idx, on) {
    // Visual flash on the on-screen pad.
    const el = document.querySelector(`.mq-simon-pad[data-pad="${idx}"]`);
    if (el) el.style.filter = on ? 'brightness(2.2) drop-shadow(0 0 12px ' + PADS[idx].hex + ')' : '';
    // Drive all 4 onboard NeoPixels — light up the matching index pad
    // and turn the others off so the hardware mirror is unambiguous.
    try {
      if (window.bleScheduler) {
        for (let i = 0; i < 4; i++) {
          const [r, g, b] = (on && i === idx) ? PADS[idx].rgb : [0, 0, 0];
          window.bleScheduler.send(`RGB:${i},${r},${g},${b}`, { coalesce: true }).catch(() => {});
        }
      }
    } catch {}
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function flash(idx, dur) {
    lightUp(idx, true);
    tone(PADS[idx].hz, dur);
    await sleep(dur);
    lightUp(idx, false);
    await sleep(120);
  }

  async function playSequence() {
    playing = true;
    paintFeedback('▶ watch carefully…', '#38bdf8');
    // Speed up gently as sequence grows — keeps it engaging.
    const dur = Math.max(220, 520 - sequence.length * 15);
    for (const idx of sequence) {
      if (!alive) return;
      await flash(idx, dur);
    }
    playing  = false;
    userIdx  = 0;
    paintFeedback('🎯 your turn — repeat the sequence!', '#fbbf24');
  }

  function paintRound() {
    const r = document.getElementById('mqSimonRound');
    if (r) r.textContent = sequence.length || '—';
  }
  function paintBest() {
    let best = 0;
    try { best = +localStorage.getItem(KEY_BEST) || 0; } catch {}
    const el = document.getElementById('mqSimonBest');
    if (el) el.textContent = best > 0 ? best : '—';
  }
  function paintFeedback(msg, color) {
    const fb = document.getElementById('mqSimonFeedback');
    if (!fb) return;
    fb.textContent = msg;
    fb.style.color = color || 'var(--text-secondary, #93a8c4)';
  }

  function nextRound() {
    sequence.push(Math.floor(Math.random() * 4));
    paintRound();
    setTimeout(playSequence, 600);
  }

  function start() {
    sequence = [];
    userIdx  = 0;
    alive    = true;
    paintRound();
    nextRound();
  }

  async function gameOver() {
    alive = false;
    const score = sequence.length - 1;     // they failed at this round
    let best = 0;
    try { best = +localStorage.getItem(KEY_BEST) || 0; } catch {}
    if (score > best) {
      best = score;
      try { localStorage.setItem(KEY_BEST, String(best)); } catch {}
      paintBest();
    }
    paintFeedback(`💥 Game over — you reached round ${score}. Best: ${best}.`, '#f87171');
    // Sad-trombone: pulse all pads red briefly.
    for (let n = 0; n < 2; n++) {
      for (let i = 0; i < 4; i++) lightUp(i, true);
      await sleep(150);
      for (let i = 0; i < 4; i++) lightUp(i, false);
      await sleep(150);
    }
  }

  function onPad(e) {
    if (!alive || playing) return;
    const idx = +e.currentTarget.dataset.pad;
    flash(idx, 220);
    if (sequence[userIdx] !== idx) { gameOver(); return; }
    userIdx++;
    if (userIdx >= sequence.length) {
      paintFeedback(`✓ round ${sequence.length} cleared!`, '#4ade80');
      setTimeout(nextRound, 700);
    }
  }

  function init() {
    if (!document.getElementById('mqSimonGame')) return;
    paintBest();
    paintRound();
    document.querySelectorAll('.mq-simon-pad').forEach(el => {
      el.addEventListener('click', onPad);
    });
    const start_ = document.getElementById('mqSimonStart');
    if (start_) start_.addEventListener('click', start);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
