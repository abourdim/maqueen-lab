// ============================================================
// voice-commands.js — Hands-free driving with the Web Speech API.
//
// Microphone listens continuously while the toggle is on. When the
// recognizer reports a final phrase, we match it against a tiny
// vocabulary (forward/back/left/right/stop/spin/faster/slower) and
// drive the keypad buttons that already exist. No new motion path.
//
// Vocab is multilingual: EN/FR/AR seed words. The recognizer's
// language is locked to the document's <html lang> for best accuracy.
//
// Browser support is uneven: Chrome / Edge desktop only (no Firefox,
// no Safari iOS). We feature-detect and silently disable the toggle
// where unsupported.
//
// Privacy: audio is streamed to the browser's speech service (Google
// for Chrome). The toggle has a "🎙 ON" indicator so the user is
// never accidentally listening.
// ============================================================
(function () {
  'use strict';

  const KEY_ENABLED = 'maqueen.voiceEnabled';

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = !!SR;

  // Phrase → keypad data-key. Multilingual hits the same target.
  // Order matters: longer phrases first so 'turn left' beats 'left'
  // when both could match.
  const VOCAB = [
    // Stop — universal first because the user might be panicking.
    [/(stop|halt|st[oô]p|arr[eê]te|قف|توقف)/i,                     ' '],
    // Forward
    [/(forward|go|ahead|advance|avance|amam|تقدم|انطلق)/i,         'w'],
    // Backward
    [/(back(ward)?|reverse|recule|recul|إرجع|للخلف)/i,             's'],
    // Spin / turn left
    [/(spin\s*left|turn\s*left|left|gauche|يسار)/i,                'a'],
    // Spin / turn right
    [/(spin\s*right|turn\s*right|right|droite|يمين)/i,             'd'],
    // Spin in place (default left if unspecified)
    [/(spin|tournes?|spin\s*around|د[وو]ر)/i,                      'a'],
  ];

  // Phrases that change speed instead of motion direction.
  const SPEED_VOCAB = [
    [/(faster|speed\s*up|plus\s*vite|أسرع)/i,  +30],
    [/(slower|slow\s*down|moins\s*vite|أبطأ)/i, -30],
  ];

  // Map a recognized data-key to the keypad button and click it.
  function press(key) {
    const sel = `.mq-drive-btn[data-key="${key === ' ' ? ' ' : key}"]`;
    const btn = document.querySelector(sel);
    if (btn) btn.click();
  }

  function nudgeSpeed(delta) {
    const slider = document.getElementById('mqSpeedSlider');
    if (!slider) return;
    const v = Math.max(50, Math.min(255, (+slider.value || 200) + delta));
    slider.value = String(v);
    slider.setAttribute('value', String(v));
    slider.dispatchEvent(new Event('input',  { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function handlePhrase(text) {
    text = (text || '').trim();
    if (!text) return;
    // Speed nudges first (they don't conflict with motion words).
    for (const [re, delta] of SPEED_VOCAB) {
      if (re.test(text)) { nudgeSpeed(delta); flash(text, '#fbbf24'); return; }
    }
    for (const [re, key] of VOCAB) {
      if (re.test(text)) { press(key); flash(text, '#4ade80'); return; }
    }
    flash('?  ' + text, '#f87171');
  }

  // Brief visual confirmation under the mic toggle so the kid sees
  // their words being recognized in real time.
  let flashEl;
  function flash(msg, color) {
    if (!flashEl) return;
    flashEl.textContent = msg;
    flashEl.style.color = color;
    clearTimeout(flash._t);
    flash._t = setTimeout(() => {
      if (flashEl) flashEl.textContent = '';
    }, 1500);
  }

  let recog = null;
  let listening = false;
  let userStopped = false;

  function start() {
    if (!supported || listening) return;
    recog = new SR();
    recog.continuous = true;
    recog.interimResults = false;
    // Use the document language if it matches a known SR locale, else
    // default to en-US (most-trained model, accepts code-switching).
    const lang = (document.documentElement.lang || 'en').toLowerCase();
    recog.lang = ({ en: 'en-US', fr: 'fr-FR', ar: 'ar-SA' })[lang] || 'en-US';
    recog.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) handlePhrase(e.results[i][0].transcript);
      }
    };
    recog.onend = () => {
      listening = false;
      paint();
      // Auto-restart unless the user explicitly turned it off — the
      // SR API stops itself after long silence on some browsers.
      if (!userStopped) setTimeout(() => { try { start(); } catch {} }, 250);
    };
    recog.onerror = (e) => {
      // 'no-speech' is normal silence; 'not-allowed' = mic permission
      // denied (the toggle stays visually 'on' so the user notices).
      if (e.error === 'not-allowed') {
        userStopped = true;
        flash('mic blocked', '#f87171');
      }
    };
    try { recog.start(); listening = true; userStopped = false; }
    catch { listening = false; }
    paint();
  }
  function stop() {
    userStopped = true;
    if (recog) try { recog.stop(); } catch {}
    listening = false;
    paint();
  }

  let btn;
  function paint() {
    if (!btn) return;
    btn.classList.toggle('mq-voice-on', listening);
    btn.textContent = listening ? '🎙 ON' : '🎙 voice';
    btn.title = listening
      ? 'Listening… try "forward", "stop", "spin left", "faster"'
      : 'Voice control: click and grant mic permission';
    try { localStorage.setItem(KEY_ENABLED, listening ? '1' : '0'); } catch {}
  }

  function inject() {
    // Park the toggle in the Drive sub-tab's macro bar (next to Record/
    // Replay). It's a 'session control' just like those.
    const macroBar = document.querySelector('.mq-macro-bar');
    if (!macroBar) return false;
    if (document.getElementById('mqVoiceBtn')) return true;

    btn = document.createElement('button');
    btn.id = 'mqVoiceBtn';
    btn.type = 'button';
    btn.className = 'mq-macro-btn mq-voice-btn';
    if (!supported) {
      btn.disabled = true;
      btn.textContent = '🎙 N/A';
      btn.title = 'Voice control needs Chrome or Edge (Web Speech API).';
      macroBar.appendChild(btn);
      return true;
    }
    flashEl = document.createElement('span');
    flashEl.className = 'mq-voice-flash';
    flashEl.style.cssText = 'font-family:monospace; font-size:11px; min-width:120px;';
    btn.addEventListener('click', () => listening ? stop() : start());
    macroBar.appendChild(btn);
    macroBar.appendChild(flashEl);
    paint();
    return true;
  }

  function init() {
    if (!inject()) {
      // Macro bar not ready yet; retry briefly. Cap retries.
      let tries = 0;
      const id = setInterval(() => {
        if (inject() || ++tries > 20) clearInterval(id);
      }, 200);
    }
  }

  window.mqVoice = { start, stop, isListening: () => listening, supported };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
