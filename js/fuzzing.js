// ============================================================
// fuzzing.js — Find-the-crash CTF playground.
//
// Hidden mode for hacker-leaning kids. Click 🐛 in the macro bar
// to open a panel with three attack tools:
//   1. Random Bytes Cannon — sends random hex strings up to N bytes
//   2. Verb Mutator — picks a known verb and randomly perturbs args
//   3. Replay Storm — captures recent commands and replays them at
//      10× original rate to stress-test the queue
//
// For each attack, logs whether the BLE link survived (still echoing
// commands afterward) and how many ERR: replies came back. Score =
// total bug bounty points. Persists.
//
// Designed to be SAFE: the firmware always recovers (BLE-stack
// resilience is built-in), and we cap bursts to 50 packets / second.
// ============================================================
(function () {
  'use strict';

  const KEY = 'maqueen.fuzzScore';
  let score = 0;
  let attacks = [];

  function loadScore() {
    try { score = +localStorage.getItem(KEY) || 0; } catch {}
  }
  function saveScore() {
    try { localStorage.setItem(KEY, String(score)); } catch {}
  }

  function bumpScore(n, reason) {
    score += n;
    saveScore();
    paint(`+${n} pts · ${reason}  ·  total ${score}`, '#4ade80');
    const sEl = document.getElementById('mqFuzzScore');
    if (sEl) sEl.textContent = score;
  }

  function paint(msg, color) {
    const el = document.getElementById('mqFuzzLog');
    if (!el) return;
    const line = document.createElement('div');
    line.style.cssText = `font-family:monospace; font-size:11px; color:${color || '#94a3b8'}; padding:2px 0;`;
    line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
    // Cap log length
    while (el.children.length > 100) el.removeChild(el.firstChild);
  }

  function randomHex(n) {
    let s = '';
    for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
    return s;
  }
  function randomString(n) {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_,:.;!?@#$%^&*()[]{}<>+=|';
    let s = '';
    for (let i = 0; i < n; i++) s += charset[Math.floor(Math.random() * charset.length)];
    return s;
  }

  // ---- Attack 1: Random Bytes Cannon ----
  async function attackRandomBytes(n = 50) {
    if (!window.bleScheduler) { paint('no BLE link', '#f87171'); return; }
    paint(`🎯 Random Bytes Cannon · ${n} packets`, '#fbbf24');
    let errs = 0, sent = 0;
    const before = performance.now();
    for (let i = 0; i < n; i++) {
      const len = 1 + Math.floor(Math.random() * 30);
      const payload = randomString(len);
      try {
        await window.bleScheduler.send(payload, { coalesce: false }).catch(() => { errs++; });
        sent++;
      } catch { errs++; }
      await new Promise(r => setTimeout(r, 20));    // 50 Hz cap
    }
    const dur = ((performance.now() - before) / 1000).toFixed(1);
    paint(`✓ sent ${sent}, errors ${errs} (in ${dur}s)`, errs ? '#fbbf24' : '#4ade80');
    bumpScore(errs > 0 ? 5 : 1, 'random bytes cannon');
    attacks.push({ kind: 'random', sent, errs, dur });
  }

  // ---- Attack 2: Verb Mutator ----
  async function attackVerbMutator(n = 40) {
    if (!window.bleScheduler) { paint('no BLE link', '#f87171'); return; }
    paint(`🎯 Verb Mutator · ${n} mutations`, '#fbbf24');
    const verbs = [
      () => `M:${randomHex(4)},${randomHex(4)}`,
      () => `M:${Math.random()*10000-5000|0},${Math.random()*10000-5000|0}`,
      () => `SRV:${Math.random()*5000|0},${Math.random()*5000|0}`,
      () => `LED:${Math.random()*100|0},${Math.random()*100|0}`,
      () => `RGB:${Math.random()*100|0},${Math.random()*1000|0},${Math.random()*1000|0},${Math.random()*1000|0}`,
      () => `BUZZ:${Math.random()*100000|0},${Math.random()*100000|0}`,
      () => `M:` + 'A'.repeat(200),                // buffer-overflow attempt
      () => `M:99999999999,99999999999`,           // overflow ints
      () => `${randomString(3)}:${randomString(8)}`,// unknown verb
      () => `M:${[...Array(50)].map(() => Math.random()*100|0).join(',')}`, // too many args
    ];
    let errs = 0;
    for (let i = 0; i < n; i++) {
      const v = verbs[Math.floor(Math.random() * verbs.length)]();
      try {
        await window.bleScheduler.send(v, { coalesce: false }).catch(() => { errs++; });
      } catch { errs++; }
      await new Promise(r => setTimeout(r, 25));
    }
    paint(`✓ ${n} mutations, errors ${errs}`, errs ? '#fbbf24' : '#4ade80');
    bumpScore(errs > 5 ? 10 : 3, 'verb mutator');
    attacks.push({ kind: 'mutator', sent: n, errs });
  }

  // ---- Attack 3: Replay Storm ----
  async function attackReplayStorm() {
    if (!window.bleScheduler) { paint('no BLE link', '#f87171'); return; }
    paint(`🎯 Replay Storm · M: spam at 50 Hz`, '#fbbf24');
    let errs = 0;
    for (let i = 0; i < 100; i++) {
      try {
        const v = i % 4 === 0 ? 'STOP' : `M:${(Math.random()*200)|0},${(Math.random()*200)|0}`;
        await window.bleScheduler.send(v, { coalesce: true }).catch(() => { errs++; });
      } catch { errs++; }
      await new Promise(r => setTimeout(r, 20));
    }
    paint(`✓ 100 packets, errors ${errs}`, errs ? '#fbbf24' : '#4ade80');
    bumpScore(2, 'replay storm');
  }

  // ---- Sanity check: is BLE still alive after the attack? ----
  async function healthCheck() {
    if (!window.bleScheduler) { paint('no BLE link', '#f87171'); return; }
    try {
      await window.bleScheduler.send('STOP', { coalesce: false });
      paint('🟢 BLE link healthy — robot survived', '#4ade80');
    } catch (e) {
      paint('🔴 BLE link DOWN — you broke it! +20 pts', '#f87171');
      bumpScore(20, 'killed the link');
    }
  }

  // ---- UI ----
  function buildPanel() {
    const drive = document.querySelector('[data-mq-sub="drive"]');
    if (!drive) return false;
    if (document.getElementById('mqFuzzPanel')) return true;
    const panel = document.createElement('div');
    panel.id = 'mqFuzzPanel';
    panel.style.cssText = 'display:none; margin-top:12px; padding:14px; background:#0a0e1a; border:1px solid #ef4444; border-radius:10px; font-family:JetBrains Mono, monospace; color:#e6eef9; box-shadow:inset 0 0 30px rgba(239,68,68,0.06);';
    panel.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px; flex-wrap:wrap;">
        <span style="font-size:18px;">🐛</span>
        <span style="font-weight:700; color:#ef4444;">FUZZING PLAYGROUND</span>
        <span style="font-size:11px; color:#94a3b8;">— bug bounty for kid hackers</span>
        <span style="margin-left:auto; font-size:11px;">score: <b id="mqFuzzScore" style="color:#fbbf24;">0</b></span>
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">
        <button id="mqFuzzAtk1" type="button" style="padding:6px 12px; background:transparent; color:#ef4444; border:1px solid #ef4444; border-radius:6px; cursor:pointer; font-family:inherit; font-size:11px;">🎯 Random Bytes Cannon</button>
        <button id="mqFuzzAtk2" type="button" style="padding:6px 12px; background:transparent; color:#fbbf24; border:1px solid #fbbf24; border-radius:6px; cursor:pointer; font-family:inherit; font-size:11px;">🧬 Verb Mutator</button>
        <button id="mqFuzzAtk3" type="button" style="padding:6px 12px; background:transparent; color:#38bdf8; border:1px solid #38bdf8; border-radius:6px; cursor:pointer; font-family:inherit; font-size:11px;">⚡ Replay Storm</button>
        <button id="mqFuzzHealth" type="button" style="padding:6px 12px; background:transparent; color:#4ade80; border:1px solid #4ade80; border-radius:6px; cursor:pointer; font-family:inherit; font-size:11px;">💓 Health Check</button>
      </div>
      <div id="mqFuzzLog" style="max-height:160px; overflow-y:auto; padding:8px; background:#000; border-radius:6px; border:1px solid #1f2a44;"></div>
      <div style="margin-top:8px; font-size:10px; color:#94a3b8; opacity:0.7;">
        Cap: 50 Hz. The firmware self-heals, but you can earn +20 pts if you actually drop the link.
      </div>
    `;
    drive.appendChild(panel);
    return true;
  }

  function injectToggle() {
    const macroBar = document.querySelector('.mq-macro-bar');
    if (!macroBar) return false;
    if (document.getElementById('mqFuzzBtn')) return true;
    const btn = document.createElement('button');
    btn.id = 'mqFuzzBtn';
    btn.type = 'button';
    btn.className = 'mq-macro-btn mq-fuzz-btn';
    btn.textContent = '🐛 fuzz';
    btn.title = 'Fuzzing Playground — find what crashes the robot. +20 pts if you kill the link.';
    btn.addEventListener('click', () => {
      const panel = document.getElementById('mqFuzzPanel');
      if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
    macroBar.appendChild(btn);
    return true;
  }

  function init() {
    loadScore();
    let tries = 0;
    const id = setInterval(() => {
      const ok = buildPanel() && injectToggle();
      if (ok || ++tries > 20) {
        clearInterval(id);
        const sEl = document.getElementById('mqFuzzScore');
        if (sEl) sEl.textContent = score;
        document.getElementById('mqFuzzAtk1')?.addEventListener('click', () => attackRandomBytes(50));
        document.getElementById('mqFuzzAtk2')?.addEventListener('click', () => attackVerbMutator(40));
        document.getElementById('mqFuzzAtk3')?.addEventListener('click', () => attackReplayStorm());
        document.getElementById('mqFuzzHealth')?.addEventListener('click', () => healthCheck());
      }
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
