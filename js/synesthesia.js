// ============================================================
// synesthesia.js — Each BLE byte plays a musical note.
//
// Toggle 🎼 in the Drive macro bar. When ON, every line that
// goes out via bleScheduler.send is also "played" through Web
// Audio: the verb prefix selects an instrument (waveform), and
// the numeric arguments map to a pentatonic scale so the result
// is always musically pleasant.
//
// Driving the robot becomes composition. Roll in a circle = a
// melodic loop. Zigzag = jazz. Stop-and-go = staccato.
//
// Implementation: monkey-patch bleScheduler.send to also call
// playForVerb() before delegating to the original. We reuse the
// pair-robots interceptor pattern, but coexist cleanly.
// ============================================================
(function () {
  'use strict';

  const KEY = 'maqueen.synOn';
  let on = false;
  let ac = null;

  // Pentatonic scale (C major pentatonic, 2 octaves)
  const SCALE_HZ = [
    261.63, 293.66, 329.63, 392.00, 440.00,        // C4 D4 E4 G4 A4
    523.25, 587.33, 659.25, 783.99, 880.00,        // C5 D5 E5 G5 A5
  ];
  // Verb → (waveform, base octave). Each instrument is a different verb.
  const INSTRUMENT = {
    'M:':    { type: 'sawtooth',  base: 0 },   // motors = bass saw
    'STOP':  { type: 'square',    base: 0 },   // stop = sharp click
    'SRV:':  { type: 'sine',      base: 5 },   // servo = clean sine
    'LED:':  { type: 'triangle',  base: 3 },   // LED = soft tri
    'RGB:':  { type: 'sine',      base: 7 },   // pixel = high sine
    'BUZZ:': { type: 'square',    base: 5 },   // buzzer = mid square
    'DIST?': { type: 'sine',      base: 2 },
    'LINE?': { type: 'sine',      base: 2 },
    'IR?':   { type: 'sine',      base: 2 },
    'BAT?':  { type: 'sine',      base: 1 },
    'HEAD?': { type: 'sine',      base: 1 },
  };

  function ensureAc() {
    try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); } catch {}
    return ac;
  }

  function pickInstrument(line) {
    for (const k of Object.keys(INSTRUMENT)) {
      if (line.startsWith(k)) return INSTRUMENT[k];
    }
    return { type: 'sine', base: 4 };
  }

  function playForVerb(line) {
    if (!on) return;
    const c = ensureAc();
    if (!c) return;
    const inst = pickInstrument(line);
    // Hash numeric args (or chars) → pentatonic note index.
    // For "M:200,100" → digits sum mod scale length.
    let acc = 0;
    for (const ch of line) acc = (acc * 31 + ch.charCodeAt(0)) >>> 0;
    const idx = acc % SCALE_HZ.length;
    let hz = SCALE_HZ[idx];
    // Base octave shift (verb-specific) for harmonic separation.
    if (inst.base >= 5) hz *= 2;          // up an octave for "high" verbs
    if (inst.base <= 1) hz /= 2;          // down for "low"

    const t0 = c.currentTime;
    const dur = 0.12;
    const t1 = t0 + dur;
    const osc = c.createOscillator();
    const g   = c.createGain();
    osc.type = inst.type;
    osc.frequency.value = hz;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.10, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t1);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t1 + 0.05);
  }

  // ---- Hook bleScheduler.send transparently -----------------------
  let hooked = false;
  function hook() {
    if (hooked || !window.bleScheduler) return;
    hooked = true;
    const orig = window.bleScheduler.send.bind(window.bleScheduler);
    window.bleScheduler.send = function (line, opts) {
      try { playForVerb(line); } catch {}
      return orig(line, opts);
    };
  }

  function paintBtn() {
    const btn = document.getElementById('mqSynBtn');
    if (!btn) return;
    btn.classList.toggle('mq-syn-on', on);
    btn.textContent = on ? '🎼 ON' : '🎼 syn';
    btn.title = on
      ? 'Synesthesia ON — every BLE command plays a musical note. Drive = compose.'
      : 'Synesthesia Mode — turn drive into music.';
  }

  function setOn(v) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch {}
    if (on) hook();   // hook lazily; no overhead when off
    paintBtn();
  }

  function inject() {
    const macroBar = document.querySelector('.mq-macro-bar');
    if (!macroBar) return false;
    if (document.getElementById('mqSynBtn')) return true;
    const btn = document.createElement('button');
    btn.id = 'mqSynBtn';
    btn.type = 'button';
    btn.className = 'mq-macro-btn mq-syn-btn';
    btn.addEventListener('click', () => setOn(!on));
    macroBar.appendChild(btn);
    return true;
  }

  function init() {
    if (!inject()) {
      let tries = 0;
      const id = setInterval(() => {
        if (inject() || ++tries > 20) clearInterval(id);
      }, 200);
    }
    try { setOn(localStorage.getItem(KEY) === '1'); } catch { paintBtn(); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
