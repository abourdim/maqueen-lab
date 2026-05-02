/* ═══════════════════════════════════════════════════════════════════
   MAQUEEN LAB · Voice Picker — central TTS voice selection
   ═══════════════════════════════════════════════════════════════════
   Exposes window.RobiVoice with:
     - pick(lang)            → SpeechSynthesisVoice or null
     - applyTo(utter, lang)  → sets utter.voice + utter.lang
     - mount(el, lang, opts) → renders a <select> picker into el
   Selection persists per-language in localStorage.robi.voice.{lang}.
   Used by:
     • js/claude-dialogue.js · js/session-recap.js · js/youtuber-mode.js
     • docs/schematics-kids.{en,fr,ar}.html (could be refactored later)
     • Settings drawer in index.html (3 widgets EN/FR/AR)
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const LANG_PREFIX = { en: 'en-', fr: 'fr-', ar: 'ar-' };
  const KEY = lang => 'robi.voice.' + lang;

  function normLang(lang) {
    return (lang || 'en').slice(0, 2).toLowerCase();
  }

  function listVoices(lang) {
    if (!window.speechSynthesis) return [];
    const all = window.speechSynthesis.getVoices();
    const prefix = LANG_PREFIX[normLang(lang)] || 'en-';
    const matches = all.filter(v => v.lang.toLowerCase().startsWith(prefix));
    return matches.length ? matches : all;
  }

  function pick(lang) {
    if (!window.speechSynthesis) return null;
    lang = normLang(lang);
    const all = window.speechSynthesis.getVoices();
    let saved = null;
    try { saved = localStorage.getItem(KEY(lang)); } catch (e) {}
    if (saved) {
      const v = all.find(x => x.name === saved);
      if (v) return v;
    }
    // No saved or saved-but-uninstalled → first match for the lang.
    const prefix = LANG_PREFIX[lang] || 'en-';
    return all.find(x => x.lang.toLowerCase().startsWith(prefix)) || null;
  }

  function applyTo(utterance, lang) {
    if (!utterance) return;
    lang = normLang(lang);
    const langTag = ({ en: 'en-US', fr: 'fr-FR', ar: 'ar-SA' })[lang] || 'en-US';
    utterance.lang = langTag;
    const v = pick(lang);
    if (v) utterance.voice = v;
  }

  function mount(el, lang, opts) {
    if (!el) return;
    lang = normLang(lang);
    opts = opts || {};
    const placeholder = opts.placeholder || '🎤 Auto voice';

    const sel = document.createElement('select');
    sel.setAttribute('aria-label', opts.ariaLabel || ('Voice for ' + lang.toUpperCase()));
    if (opts.className) sel.className = opts.className;
    if (opts.style) sel.style.cssText = opts.style;

    function refill() {
      const voices = listVoices(lang);
      const saved = (function () { try { return localStorage.getItem(KEY(lang)); } catch (e) { return null; } })();
      sel.innerHTML = '<option value="">' + placeholder + '</option>' +
        voices.map(v => '<option value="' + v.name + '"' + (saved === v.name ? ' selected' : '') + '>' + v.name + ' · ' + v.lang + (v.default ? ' ★' : '') + '</option>').join('');
    }
    refill();
    sel.addEventListener('change', e => {
      try { localStorage.setItem(KEY(lang), e.target.value); } catch (_) {}
      // Quick audio preview of the selected voice
      try {
        if (window.speechSynthesis && e.target.value) {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(opts.previewText || ({ en: 'Hello! This is your robot voice.', fr: 'Salut ! C\'est la voix de ton robot.', ar: 'مرحباً ! هذا صوت روبوتك.' })[lang] || 'Hello!');
          applyTo(u, lang);
          u.rate = 1; u.pitch = 1.05;
          window.speechSynthesis.speak(u);
        }
      } catch (_) {}
    });

    if (window.speechSynthesis) {
      window.speechSynthesis.addEventListener('voiceschanged', refill);
      // Some browsers (Chrome) need a kick:
      setTimeout(refill, 50);
      setTimeout(refill, 500);
    }

    el.appendChild(sel);
    return sel;
  }

  window.RobiVoice = { pick: pick, applyTo: applyTo, mount: mount, list: listVoices };
})();
