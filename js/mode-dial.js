// ============================================================
// mode-dial.js — Single segmented selector replacing 9 macro toggles.
//
// Input modes for driving are MUTUALLY EXCLUSIVE in practice (you
// can't drive sanely with voice AND tilt AND hands all on at once).
// The macro bar's 9 toggles encouraged users to flip them all on,
// which led to overlapping commands and chaos.
//
// This module:
//   1. Hides the original 9 individual toggle buttons (Voice, Tilt,
//      Co-Pilot, Whistle, Hands, Chat, Synesthesia, Fuzz, Fencing).
//   2. Inserts a SINGLE segmented selector at the top of the macro
//      bar with one pill per input mode + a "🛞 keys" default.
//   3. Selecting a pill turns OFF whichever mode was previously on
//      and turns ON the new one — by clicking the underlying toggle
//      button (so all the existing logic in voice-commands.js, etc.
//      keeps working unchanged).
//
// FX modes (Synesthesia) and hacker tools (Fuzz, Fencing) are NOT
// mode-dial members — they coexist with any input mode and live in
// the "🔬 Lab" drawer (next move). For now they're just hidden from
// the macro bar; the Lab drawer move surfaces them again.
// ============================================================
(function () {
  'use strict';

  const KEY = 'maqueen.activeMode';

  // Each mode = { id, label, btnId (the original toggle button) }.
  // 'keys' has no underlying toggle (it's the default when no input
  // mode is active). Selecting 'keys' just turns off whatever's on.
  const MODES = [
    { id: 'keys',     label: '⌨️ keys',     btnId: null,           color: '#94a3b8' },
    { id: 'voice',    label: '🎙 voice',    btnId: 'mqVoiceBtn',   color: '#c084fc' },
    { id: 'tilt',     label: '📱 tilt',     btnId: 'mqTiltBtn',    color: '#fbbf24' },
    { id: 'hands',    label: '👋 hands',    btnId: 'mqGestureBtn', color: '#22d3ee' },
    { id: 'whistle',  label: '🐕 whistle',  btnId: 'mqWhistleBtn', color: '#fbbf24' },
    { id: 'chat',     label: '🤖 chat',     btnId: 'mqClaudeBtn',  color: '#38bdf8' },
    { id: 'copilot',  label: '👯 co-pilot', btnId: 'mqCoPilotBtn', color: '#38bdf8' },
  ];

  // Buttons that are NOT input modes — hidden from the macro bar by
  // mode-dial, surfaced again later by the Lab drawer.
  const TO_HIDE_FROM_MACRO_BAR = [
    'mqSynBtn',      // Synesthesia (FX)
    'mqFuzzBtn',     // Fuzzing playground (hacker)
    'mqFencingBtn',  // Fencing mode (multiplayer)
  ];

  let activeMode = 'keys';
  let dialEl = null;

  function paint() {
    if (!dialEl) return;
    dialEl.querySelectorAll('.mq-mode-pill').forEach(p => {
      p.classList.toggle('mq-mode-pill-active', p.dataset.mode === activeMode);
    });
  }

  function ensureModeOn(id) {
    const m = MODES.find(x => x.id === id);
    if (!m || !m.btnId) return;
    const btn = document.getElementById(m.btnId);
    if (!btn) return;
    // Detect if the toggle is already in 'on' state. The convention
    // we standardized: 'mq-X-on' class on the button. If absent, click.
    const onClass = Array.from(btn.classList).find(c => /-on$/.test(c));
    if (!onClass) btn.click();
  }
  function ensureModeOff(id) {
    const m = MODES.find(x => x.id === id);
    if (!m || !m.btnId) return;
    const btn = document.getElementById(m.btnId);
    if (!btn) return;
    const onClass = Array.from(btn.classList).find(c => /-on$/.test(c));
    if (onClass) btn.click();
  }

  function selectMode(id) {
    if (id === activeMode) return;
    // Turn off the previous mode (if it had a button)
    ensureModeOff(activeMode);
    // Turn on the new one
    ensureModeOn(id);
    activeMode = id;
    try { localStorage.setItem(KEY, id); } catch {}
    paint();
  }

  function buildDial() {
    const macroBar = document.querySelector('.mq-macro-bar');
    if (!macroBar) return false;
    if (document.getElementById('mqModeDial')) return true;

    // Hide the now-redundant individual mode buttons.
    [...MODES.map(m => m.btnId), ...TO_HIDE_FROM_MACRO_BAR].forEach(id => {
      if (!id) return;
      const b = document.getElementById(id);
      if (b) b.style.display = 'none';
    });

    // Build the segmented dial.
    dialEl = document.createElement('div');
    dialEl.id = 'mqModeDial';
    dialEl.className = 'mq-mode-dial';
    const label = document.createElement('span');
    label.className = 'mq-mode-dial-label';
    label.textContent = 'INPUT';
    dialEl.appendChild(label);
    MODES.forEach(m => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'mq-mode-pill';
      pill.dataset.mode = m.id;
      pill.style.setProperty('--mode-color', m.color);
      pill.textContent = m.label;
      pill.title = `Switch input to ${m.label}`;
      pill.addEventListener('click', () => selectMode(m.id));
      dialEl.appendChild(pill);
    });
    // Insert at the top of the macro bar (before all toggles).
    macroBar.insertBefore(dialEl, macroBar.firstChild);
    return true;
  }

  function init() {
    let tries = 0;
    const id = setInterval(() => {
      if (buildDial() || ++tries > 30) {
        clearInterval(id);
        try { activeMode = localStorage.getItem(KEY) || 'keys'; } catch {}
        paint();
      }
    }, 200);
  }

  window.mqModeDial = { select: selectMode, current: () => activeMode };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
