// ============================================================
// morse-decoder.js — Game: buzzer plays a Morse-code word, kid
// types what they hear, score = exact letter matches.
//
// Generates a random message of N letters (N picked by user).
// Plays it via the BLE buzzer (BUZZ:f,ms) if connected; otherwise
// falls back to a local Web Audio oscillator so the game works
// offline / unpaired. Standard timing:
//   dot = T ms, dash = 3T, intra-letter gap = T,
//   inter-letter gap = 3T, inter-word gap = 7T.
// ============================================================
(function () {
  'use strict';

  const KEY_BEST = 'maqueen.morseBest';

  // International Morse alphabet (letters + a few common digits).
  const M = {
    A:'.-',    B:'-...',  C:'-.-.',  D:'-..',   E:'.',
    F:'..-.',  G:'--.',   H:'....',  I:'..',    J:'.---',
    K:'-.-',   L:'.-..',  M:'--',    N:'-.',    O:'---',
    P:'.--.',  Q:'--.-',  R:'.-.',   S:'...',   T:'-',
    U:'..-',   V:'...-',  W:'.--',   X:'-..-',  Y:'-.--',
    Z:'--..',
  };
  const LETTERS = Object.keys(M);
  const TONE_HZ = 700;

  let answer  = '';
  let dotMs   = 100;     // updated from select on each round
  let playing = false;

  // ---- Audio fallback: tiny Web Audio sine on user gesture ----
  let ac = null;
  function ensureAc() {
    if (ac) return ac;
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
    return ac;
  }
  function localBeep(durMs) {
    const c = ensureAc();
    if (!c) return;
    const t0 = c.currentTime;
    const t1 = t0 + durMs / 1000;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = TONE_HZ;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.18, t0 + 0.005);
    gain.gain.setValueAtTime(0.18, t1 - 0.01);
    gain.gain.linearRampToValueAtTime(0, t1);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  }

  // BLE buzzer if available, else local audio.
  function beep(durMs) {
    try {
      if (window.bleScheduler && window.bleScheduler.send) {
        window.bleScheduler.send(`BUZZ:${TONE_HZ},${Math.round(durMs)}`).catch(() => {});
        return;
      }
    } catch {}
    localBeep(durMs);
  }

  // Sleep helper that respects play cancellation.
  let cancelled = false;
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function playWord(word) {
    if (playing) return;
    playing = true;
    cancelled = false;
    paintFeedback('🔊 transmitting…', '#fbbf24');
    const T = dotMs;
    for (let i = 0; i < word.length && !cancelled; i++) {
      const code = M[word[i]];
      if (!code) continue;
      for (let j = 0; j < code.length && !cancelled; j++) {
        const sym = code[j];
        const dur = sym === '.' ? T : T * 3;
        beep(dur);
        await sleep(dur);
        await sleep(T);                 // intra-letter gap (1 dot)
      }
      await sleep(T * 2);               // 1 already added → 3 total
    }
    playing = false;
    if (!cancelled) paintFeedback('✓ done — what did you hear?', 'var(--text-secondary, #93a8c4)');
  }

  function pickWord(n) {
    let w = '';
    for (let i = 0; i < n; i++) {
      w += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    }
    return w;
  }

  function paintBest() {
    let best = 0;
    try { best = +localStorage.getItem(KEY_BEST) || 0; } catch {}
    const el = document.getElementById('mqMorseBest');
    if (el) el.textContent = best > 0 ? best + '/100' : '—';
  }

  function paintFeedback(msg, color) {
    const fb = document.getElementById('mqMorseFeedback');
    if (!fb) return;
    fb.textContent = msg;
    fb.style.color = color || 'var(--text-secondary, #93a8c4)';
  }

  function readSpeed() {
    const el = document.getElementById('mqMorseSpeed');
    return el ? (+el.value || 100) : 100;
  }
  function readLength() {
    const el = document.getElementById('mqMorseLen');
    return el ? (+el.value || 4) : 4;
  }

  function newRound() {
    cancelled = true;                   // stop any playback in flight
    setTimeout(() => {
      cancelled = false;
      answer = pickWord(readLength());
      dotMs  = readSpeed();
      const guess = document.getElementById('mqMorseGuess');
      if (guess) { guess.value = ''; guess.focus(); }
      playWord(answer);
    }, 80);
  }

  function replay() {
    if (!answer) { newRound(); return; }
    cancelled = true;
    setTimeout(() => { cancelled = false; playWord(answer); }, 80);
  }

  function submit() {
    const guess = (document.getElementById('mqMorseGuess')?.value || '').toUpperCase().trim();
    if (!answer) { paintFeedback('start a new round first', '#f87171'); return; }
    let correct = 0;
    for (let i = 0; i < answer.length; i++) {
      if (guess[i] === answer[i]) correct++;
    }
    const score = Math.round(100 * correct / answer.length);
    let best = 0;
    try { best = +localStorage.getItem(KEY_BEST) || 0; } catch {}
    if (score > best) {
      best = score;
      try { localStorage.setItem(KEY_BEST, String(best)); } catch {}
      paintBest();
    }
    const emoji = score === 100 ? '🏆' : score >= 75 ? '✨' : score >= 50 ? '👍' : '📡';
    const color = score >= 75 ? '#4ade80' : score >= 50 ? '#fbbf24' : '#f87171';
    paintFeedback(`${emoji}  answer: ${answer}  •  you: ${guess || '—'}  •  ${correct}/${answer.length}  •  score ${score}/100`, color);
  }

  function init() {
    if (!document.getElementById('mqMorseGame')) return;
    paintBest();
    const newBtn  = document.getElementById('mqMorseNew');
    const playBtn = document.getElementById('mqMorsePlay');
    const subBtn  = document.getElementById('mqMorseSubmit');
    const guess   = document.getElementById('mqMorseGuess');
    if (newBtn)  newBtn.addEventListener('click', newRound);
    if (playBtn) playBtn.addEventListener('click', replay);
    if (subBtn)  subBtn.addEventListener('click', submit);
    if (guess)   guess.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
