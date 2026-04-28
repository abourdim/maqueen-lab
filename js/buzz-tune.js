// ============================================================
// buzz-tune.js — Game: piano-strip → buzzer.
//
// 8 white keys covering one octave (C5 → C6). Tap = play the note
// on both screen (Web Audio sine) and BLE buzzer. Demo button
// plays Twinkle Twinkle so kids hear what 'a tune' even sounds
// like in this medium.
//
// Notes are emitted with both visual flash and audible beep so
// the game works whether or not the robot is connected.
// ============================================================
(function () {
  'use strict';

  // C5 → C6 (12-tone equal temperament). White keys only.
  // (The major scale is C D E F G A B C — perfect for nursery rhymes.)
  const NOTES = [
    { name: 'C',  hz: 523 },
    { name: 'D',  hz: 587 },
    { name: 'E',  hz: 659 },
    { name: 'F',  hz: 698 },
    { name: 'G',  hz: 784 },
    { name: 'A',  hz: 880 },
    { name: 'B',  hz: 988 },
    { name: 'C2', hz: 1047 },
  ];

  // Twinkle Twinkle Little Star, in our 8-note scale.
  // (C C G G A A G — F F E E D D C ...)
  const TWINKLE = [
    [0,400], [0,400], [4,400], [4,400], [5,400], [5,400], [4,800],
    [3,400], [3,400], [2,400], [2,400], [1,400], [1,400], [0,800],
  ];

  let ac = null;
  function ensureAc() {
    try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); } catch {}
    return ac;
  }
  function localBeep(hz, ms) {
    const c = ensureAc();
    if (!c) return;
    const t0 = c.currentTime;
    const t1 = t0 + ms / 1000;
    const osc = c.createOscillator();
    const g   = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = hz;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.18, t0 + 0.01);
    g.gain.setValueAtTime(0.18, t1 - 0.03);
    g.gain.linearRampToValueAtTime(0, t1);
    osc.connect(g).connect(c.destination);
    osc.start(t0); osc.stop(t1 + 0.02);
  }
  function bleBeep(hz, ms) {
    try {
      if (window.bleScheduler) {
        window.bleScheduler.send(`BUZZ:${hz},${Math.round(ms)}`).catch(() => {});
      }
    } catch {}
  }
  function playNote(idx, ms) {
    if (idx < 0 || idx >= NOTES.length) return;
    const n = NOTES[idx];
    bleBeep(n.hz, ms);
    localBeep(n.hz, ms);
    flashKey(idx, ms);
  }

  function flashKey(idx, ms) {
    const k = document.querySelector(`.mq-tune-key[data-key="${idx}"]`);
    if (!k) return;
    k.classList.add('mq-tune-active');
    setTimeout(() => k.classList.remove('mq-tune-active'), Math.min(ms, 220));
  }

  function buildKeys() {
    const wrap = document.getElementById('mqTuneKeys');
    if (!wrap) return;
    wrap.innerHTML = NOTES.map((n, i) => `
      <button class="mq-tune-key" data-key="${i}" title="${n.name} (${n.hz} Hz)"
        style="flex:1; min-height:80px; max-width:60px;
               background:linear-gradient(180deg, #fff, #e2e8f0);
               color:#0f172a; border:1px solid #94a3b8;
               border-radius:0 0 8px 8px; cursor:pointer; font-weight:700;
               font-family:'JetBrains Mono', monospace; font-size:13px;
               padding:6px 4px; box-shadow:0 4px 8px rgba(0,0,0,0.3);">
        ${n.name}
      </button>
    `).join('');
    wrap.querySelectorAll('.mq-tune-key').forEach(el => {
      el.addEventListener('click', () => playNote(+el.dataset.key, 280));
    });
  }

  let demoTimer = null;
  function playDemo() {
    if (demoTimer) return;
    const fb = document.getElementById('mqTuneFeedback');
    if (fb) fb.textContent = '🎼 Twinkle Twinkle Little Star…';
    let i = 0;
    function next() {
      if (i >= TWINKLE.length) {
        if (fb) fb.textContent = '✓ that was Twinkle Twinkle — try playing it yourself!';
        demoTimer = null;
        return;
      }
      const [idx, ms] = TWINKLE[i++];
      playNote(idx, ms - 60);
      demoTimer = setTimeout(next, ms);
    }
    next();
  }

  function init() {
    if (!document.getElementById('mqTuneGame')) return;
    buildKeys();
    const demo = document.getElementById('mqTuneDemo');
    if (demo) demo.addEventListener('click', playDemo);
    // Tiny CSS injection for the active-key flash.
    if (!document.getElementById('mqTuneStyle')) {
      const s = document.createElement('style');
      s.id = 'mqTuneStyle';
      s.textContent = `.mq-tune-key.mq-tune-active {
        background: linear-gradient(180deg, #c084fc, #7e22ce) !important;
        color: #fff !important;
        box-shadow: 0 0 14px rgba(192,132,252,0.7) !important;
      }`;
      document.head.appendChild(s);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
