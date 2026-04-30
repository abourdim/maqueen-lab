// ============================================================
// claude-dialogue.js — Conversational AI: speak to Claude, robot acts.
//
// Toggle 🤖💬 in the macro bar. Workflow:
//   1. Click toggle → Web Speech listens for "Hey Maqueen, ..."
//   2. Recognized phrase → POST to Claude API with a system prompt
//      that knows the BLE verbs (M:, SRV:, RGB:, BUZZ:, STOP).
//   3. Claude returns a JSON-formatted choreography:
//        { "say": "À tes ordres!",
//          "do":  [ {"verb":"M:200,200","wait":1000},
//                   {"verb":"SRV:1,180","wait":300}, ... ] }
//   4. We TTS the "say" line and send each verb at its scheduled
//      wait offset.
//
// Needs an API key: localStorage.maqueen.claudeKey (sk-ant-...).
// On first use, prompts the user. Doesn't bundle the key.
// ============================================================
(function () {
  'use strict';

  const KEY_ENABLED = 'maqueen.claudeDialogOn';
  const KEY_APIKEY  = 'maqueen.claudeKey';

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = !!SR && !!window.fetch;

  const SYSTEM_PROMPT =
    'You are MAQUEEN, a Web-Bluetooth robot. The user talks to you in any language. ' +
    'You answer in JSON ONLY (no prose around it), in the user\'s language. Schema: ' +
    '{"say": "<short reply spoken via TTS>", "do": [{"verb": "<BLE verb>", "wait": <ms before next>}]}. ' +
    'Available BLE verbs: M:L,R (motors -255..255), STOP, SRV:port,angle (port 1|2, angle 0..180), ' +
    'LED:i,s (i 0|1, s 0|1), RGB:i,r,g,b (i 0..3, channels 0..255), BUZZ:freq,ms. ' +
    'Keep "do" sequences short (under 8 verbs, total wait under 6000ms). ' +
    'For "victory dance": spin + flash NeoPixels + a chord on the buzzer. ' +
    'For "stop everything": single STOP. For "hello": no movement, just a friendly say.';

  let on = false;
  let recog = null;
  let listening = false;
  let listenBtnEl = null;

  function getKey() {
    try { return localStorage.getItem(KEY_APIKEY); } catch { return null; }
  }
  function setKey(v) {
    try { localStorage.setItem(KEY_APIKEY, v); } catch {}
  }

  function paint() {
    if (!listenBtnEl) return;
    listenBtnEl.classList.toggle('mq-claude-on', on);
    listenBtnEl.textContent = on
      ? (listening ? '🤖💬 LISTENING' : '🤖💬 ON')
      : '🤖💬 chat';
    listenBtnEl.title = on
      ? 'Conversational mode ON — say "Hey Maqueen, [request]"'
      : 'Talk to Claude → robot acts. Needs Claude API key in localStorage.maqueen.claudeKey.';
    try { localStorage.setItem(KEY_ENABLED, on ? '1' : '0'); } catch {}
  }

  async function callClaude(userText) {
    let key = getKey();
    if (!key) {
      key = prompt('Paste your Claude API key (sk-ant-…). Stored locally only.');
      if (!key) return null;
      setKey(key.trim());
    }
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 600,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userText }],
        }),
      });
      const j = await res.json();
      if (j.error) {
        speakError('Claude error: ' + j.error.message);
        return null;
      }
      const txt = (j.content?.[0]?.text || '').trim();
      // Robust JSON extract: find first {…} block
      const m = txt.match(/\{[\s\S]*\}/);
      if (!m) { speakError('Claude reply was not JSON'); return null; }
      try { return JSON.parse(m[0]); }
      catch { speakError('Could not parse JSON reply'); return null; }
    } catch (e) {
      speakError(e.message);
      return null;
    }
  }

  function speakError(msg) {
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance('Sorry, ' + msg);
    u.rate = 1.0; u.pitch = 0.9;
    window.speechSynthesis.speak(u);
  }

  function speak(text) {
    if (!window.speechSynthesis || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    // Match doc lang
    try {
      const lang = (document.documentElement.lang || 'en').toLowerCase();
      const target = ({ en: 'en-', fr: 'fr-', ar: 'ar-' })[lang] || 'en-';
      const v = window.speechSynthesis.getVoices().find(x => x.lang.startsWith(target));
      if (v) u.voice = v;
    } catch {}
    u.pitch = 1.05; u.rate = 1.05;
    window.speechSynthesis.speak(u);
  }

  async function executeChoreo(choreo) {
    if (!choreo) return;
    if (choreo.say) speak(choreo.say);
    if (Array.isArray(choreo.do) && window.bleScheduler) {
      for (const step of choreo.do) {
        if (typeof step.verb === 'string' && step.verb.length < 80) {
          try { await window.bleScheduler.send(step.verb).catch(() => {}); } catch {}
        }
        const wait = Math.min(2000, Math.max(50, +step.wait || 250));
        await new Promise(r => setTimeout(r, wait));
      }
      // Always end with a STOP for safety
      try { await window.bleScheduler.send('STOP').catch(() => {}); } catch {}
    }
  }

  // Wake-word gate. Without this, every cough / background voice /
  // misrecognition triggers a Claude API call (= cost amplification +
  // unwanted robot motion). Recognized phrase must contain a wake word
  // before we forward to the API.
  const WAKE_WORDS = /\b(maqueen|hey\s*robot|robot|h[ée]\s*maqueen)\b/i;

  async function handlePhrase(text) {
    if (!text) return;
    if (!WAKE_WORDS.test(text)) {
      paintStatus('🔇 ignored (no wake word)', '#94a3b8');
      return;
    }
    // Strip the wake word so the prompt to Claude is the actual request.
    const cleaned = text.replace(WAKE_WORDS, '').replace(/^[\s,.:]+/, '').trim();
    if (!cleaned) {
      paintStatus('👂 yes? (say a request)', '#38bdf8');
      return;
    }
    paintStatus('💬 thinking…', '#fbbf24');
    const choreo = await callClaude(cleaned);
    if (choreo) {
      paintStatus('🤖 ' + (choreo.say || ''), '#4ade80');
      await executeChoreo(choreo);
    } else {
      paintStatus('— failed —', '#f87171');
    }
  }

  function paintStatus(msg, color) {
    let el = document.getElementById('mqClaudeStatus');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mqClaudeStatus';
      el.style.cssText = 'font-family:JetBrains Mono, monospace; font-size:11px; padding-left:8px; min-width:180px;';
      const macroBar = document.querySelector('.mq-macro-bar');
      if (macroBar) macroBar.appendChild(el);
    }
    el.textContent = msg;
    el.style.color = color || '#94a3b8';
  }

  function startListening() {
    if (!supported || listening) return;
    recog = new SR();
    recog.continuous = true;
    recog.interimResults = false;
    const lang = (document.documentElement.lang || 'en').toLowerCase();
    recog.lang = ({ en: 'en-US', fr: 'fr-FR', ar: 'ar-SA' })[lang] || 'en-US';
    recog.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) handlePhrase(e.results[i][0].transcript);
      }
    };
    recog.onend = () => { listening = false; paint(); if (on) setTimeout(startListening, 250); };
    try { recog.start(); listening = true; paint(); }
    catch { listening = false; }
  }
  function stopListening() {
    on = false; listening = false;
    try { recog && recog.stop(); } catch {}
    paint();
  }

  function toggle() {
    if (on) stopListening();
    else { on = true; paint(); startListening(); }
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
    if (document.getElementById('mqClaudeBtn')) return;
    listenBtnEl = document.createElement('button');
    listenBtnEl.id = 'mqClaudeBtn';
    listenBtnEl.type = 'button';
    listenBtnEl.className = 'mq-macro-btn mq-claude-btn';
    if (!supported) {
      listenBtnEl.disabled = true;
      listenBtnEl.textContent = '🤖💬 N/A';
      listenBtnEl.title = 'Needs Web Speech API (Chrome/Edge) + fetch';
    } else {
      listenBtnEl.addEventListener('click', toggle);
    }
    macroBar.appendChild(listenBtnEl);
    paint();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
