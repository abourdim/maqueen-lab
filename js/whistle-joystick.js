// ============================================================
// whistle-joystick.js — Whistle pitch → drive direction.
//
// Toggle 🐕 in the macro bar. When ON:
//   - Mic captures audio, autocorrelation finds the dominant pitch.
//   - High whistle (> 1500 Hz) = forward
//   - Mid whistle  (1000–1500 Hz) = left turn
//   - Low whistle  (700–1000 Hz)  = right turn
//   - Very low (< 700 Hz)         = reverse
//   - Silence                     = stop after 400 ms hold
//
// Drive is dispatched at ~5 Hz max; stops on toggle off.
// ============================================================
(function () {
  'use strict';

  const KEY = 'maqueen.whistleOn';
  let on = false;
  let stream = null;
  let ac = null;
  let analyser = null;
  let raf = null;
  let lastAction = null;
  let silenceSince = 0;

  function autocorrelate(buf, sampleRate) {
    let SIZE = buf.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return -1;        // too quiet
    let r1 = 0, r2 = SIZE - 1, threshold = 0.2;
    for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buf[i]) < threshold) { r1 = i; break; }
    for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buf[SIZE - i]) < threshold) { r2 = SIZE - i; break; }
    buf = buf.slice(r1, r2);
    SIZE = buf.length;
    const c = new Array(SIZE).fill(0);
    for (let i = 0; i < SIZE; i++) {
      for (let j = 0; j < SIZE - i; j++) c[i] += buf[j] * buf[j + i];
    }
    let d = 0;
    while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < SIZE; i++) {
      if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
    }
    let T0 = maxpos;
    if (T0 < 1) return -1;
    return sampleRate / T0;
  }

  function dispatch(action) {
    if (action === lastAction) return;
    lastAction = action;
    const map = { forward:'w', reverse:'s', left:'a', right:'d', stop:' ' };
    const k = map[action];
    if (!k) return;
    const btn = document.querySelector(`.mq-drive-btn[data-key="${k}"]`);
    if (btn) btn.click();
    paintStatus(action.toUpperCase());
  }

  function paintStatus(msg) {
    const el = document.getElementById('mqWhistleStatus');
    if (el) el.textContent = msg;
  }

  function tick() {
    if (!on || !analyser) return;
    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    const f = autocorrelate(buf, ac.sampleRate);
    const now = performance.now();
    if (f < 0) {
      // silence
      if (silenceSince === 0) silenceSince = now;
      if (now - silenceSince > 400 && lastAction !== 'stop') dispatch('stop');
    } else {
      silenceSince = 0;
      if (f > 1500)      dispatch('forward');
      else if (f > 1000) dispatch('left');
      else if (f > 700)  dispatch('right');
      else if (f > 300)  dispatch('reverse');
    }
    raf = requestAnimationFrame(tick);
  }

  async function start() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (e) { alert('Mic denied: ' + e.message); return; }
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const src = ac.createMediaStreamSource(stream);
    analyser = ac.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);
    on = true;
    paintBtn();
    paintStatus('listening…');
    tick();
  }
  function stop() {
    on = false;
    paintBtn();
    if (raf) cancelAnimationFrame(raf); raf = null;
    if (stream) stream.getTracks().forEach(t => t.stop()); stream = null;
    if (ac) try { ac.close(); } catch {}
    ac = analyser = null;
    paintStatus('');
    dispatch('stop');
  }

  function paintBtn() {
    const btn = document.getElementById('mqWhistleBtn');
    if (!btn) return;
    btn.classList.toggle('mq-whistle-on', on);
    btn.textContent = on ? '🐕 ON' : '🐕 whistle';
    btn.title = on
      ? 'Whistle joystick: high=forward · mid=left · low=right · very low=reverse · silence=stop'
      : 'Whistle Joystick — pilot the robot like Lassie';
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch {}
  }

  function init() {
    const macroBar = document.querySelector('.mq-macro-bar');
    if (!macroBar) {
      let tries = 0;
      const id = setInterval(() => {
        if (document.querySelector('.mq-macro-bar') || ++tries > 20) { clearInterval(id); init(); }
      }, 200);
      return;
    }
    if (document.getElementById('mqWhistleBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'mqWhistleBtn';
    btn.type = 'button';
    btn.className = 'mq-macro-btn mq-whistle-btn';
    btn.addEventListener('click', () => on ? stop() : start());
    macroBar.appendChild(btn);
    const status = document.createElement('span');
    status.id = 'mqWhistleStatus';
    status.style.cssText = 'font-family:monospace; font-size:11px; color:#94a3b8; padding-left:6px;';
    macroBar.appendChild(status);
    paintBtn();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
