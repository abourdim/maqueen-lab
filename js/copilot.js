// ============================================================
// copilot.js — Two-kid split-keyboard mode.
//
// Toggle 👯 in the Drive macro bar. When ON:
//   - Player 1 (LEFT)  uses W S → throttle (forward / reverse)
//   - Player 2 (RIGHT) uses J L → steering (turn left / turn right)
// Either alone does nothing — both must press complementary keys
// to roll. Forces cooperation. Frères-soeurs s'entre-tuent.
//
// Implementation: track key-down state for the 4 keys, on every
// change compute fireDrive(L, R) by mixing throttle + steering,
// dispatch via bleScheduler.send. STOP when both throttle keys
// release.
// ============================================================
(function () {
  'use strict';

  const KEY = 'maqueen.copilotOn';
  let on = false;

  // Keyboard state
  const held = { w:false, s:false, j:false, l:false };

  function readSpeed() {
    const slider = document.getElementById('mqSpeedSlider');
    return slider ? +slider.value : 200;
  }

  function tick() {
    if (!on) return;
    const speed = readSpeed();
    let throttle = 0;
    if (held.w && !held.s) throttle =  1;
    if (held.s && !held.w) throttle = -1;
    let steer = 0;
    if (held.j && !held.l) steer = -1;     // turn left
    if (held.l && !held.j) steer =  1;     // turn right
    if (throttle === 0 && steer === 0) {
      try { window.bleScheduler?.clearCoalesced('M'); } catch {}
      try { window.bleScheduler && window.bleScheduler.send('STOP').catch(()=>{}); } catch {}
      return;
    }
    // Differential mix. base = throttle, steer rotates: +steer = right.
    const base = throttle * speed;
    const turn = steer * speed * 0.5;
    const L = Math.round(base + turn);
    const R = Math.round(base - turn);
    try { window.bleScheduler && window.bleScheduler.send(`M:${L},${R}`, { coalesce: true }).catch(()=>{}); } catch {}
  }

  function onKey(e, down) {
    if (!on) return;
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 's' || k === 'j' || k === 'l') {
      held[k] = down;
      e.preventDefault();
      tick();
    }
  }

  function paintBtn() {
    const btn = document.getElementById('mqCoPilotBtn');
    if (!btn) return;
    btn.classList.toggle('mq-copilot-on', on);
    btn.textContent = on ? '👯 ON' : '👯 co-pilot';
    btn.title = on
      ? 'Co-Pilot ON — Player 1: W/S (throttle), Player 2: J/L (steer). Both must press to drive.'
      : 'Co-Pilot Mode — split keyboard between two kids.';
  }

  function setOn(v) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch {}
    if (!on) {
      held.w = held.s = held.j = held.l = false;
      try { window.bleScheduler?.clearCoalesced('M'); } catch {}
      try { window.bleScheduler && window.bleScheduler.send('STOP').catch(()=>{}); } catch {}
    }
    paintBtn();
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
    if (document.getElementById('mqCoPilotBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'mqCoPilotBtn';
    btn.type = 'button';
    btn.className = 'mq-macro-btn mq-copilot-btn';
    btn.addEventListener('click', () => setOn(!on));
    macroBar.appendChild(btn);
    document.addEventListener('keydown', e => onKey(e, true));
    document.addEventListener('keyup',   e => onKey(e, false));
    try { setOn(localStorage.getItem(KEY) === '1'); } catch { paintBtn(); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
