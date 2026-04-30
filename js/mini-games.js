// ============================================================
// mini-games.js — Echo Hunt + Maze Runner + Robot Soccer.
//
// Three light launchers that share one strip in the Drive sub-tab:
//
//  🎯 Echo Hunt  — pick a random treasure on the SLAM map. Audio
//      pings accelerate as the robot's odometry pose closes the
//      distance, klaxon at <8 cm. Pure virtual sensor; no real
//      sonar input needed. Stops on next click.
//
//  🧱 Maze mode — preset that crunches Drive speed + wander
//      threshold + sweep range to maze-friendly values, then
//      kicks off Auto-wander. One click = "robot, navigate this
//      cardboard maze on your own".
//
//  ⚽ Soccer    — minimal scoreboard for two-robot / two-player
//      matches. Just +1 buttons, persistent score, reset.
// ============================================================
(function () {
  'use strict';

  // ---- ECHO HUNT ----------------------------------------------
  let echoActive = false;
  let echoTimer  = null;
  let treasure   = null;
  let echoAc     = null;

  function ensureAc() {
    try { echoAc = echoAc || new (window.AudioContext || window.webkitAudioContext)(); } catch {}
    return echoAc;
  }
  function ping(hz) {
    const c = ensureAc();
    if (!c) return;
    const t0 = c.currentTime;
    const t1 = t0 + 0.08;
    const osc = c.createOscillator();
    const g   = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = hz;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.16, t0 + 0.005);
    g.gain.linearRampToValueAtTime(0, t1);
    osc.connect(g).connect(c.destination);
    osc.start(t0); osc.stop(t1 + 0.02);
  }

  function startEcho() {
    if (!window.mqOdometry || !window.mqOdometry.getPose) {
      flashMini('odometry not ready', '#f87171'); return;
    }
    // Place treasure at a random spot 30..90 cm from origin.
    const r = 30 + Math.random() * 60;
    const a = Math.random() * 2 * Math.PI;
    treasure = { x: r * Math.cos(a), y: r * Math.sin(a) };
    echoActive = true;
    flashMini(`🎯 treasure hidden at (${treasure.x.toFixed(0)}, ${treasure.y.toFixed(0)}) cm — listen!`, '#c084fc');
    let lastPingAt = 0;
    echoTimer = setInterval(() => {
      const pose = window.mqOdometry.getPose();
      const dx = treasure.x - pose.x, dy = treasure.y - pose.y;
      const d  = Math.hypot(dx, dy);
      // Period scales with distance: 1500 ms at d=80 cm → 80 ms at d=4 cm.
      // Hyperbolic curve so the cue gets dramatic as you close in.
      const period = Math.max(80, Math.min(1500, 80 + (d - 4) * 18));
      const now = performance.now();
      if (now - lastPingAt >= period) {
        // Frequency rises as you approach so it's not just rate, it's pitch.
        const hz = 600 + Math.max(0, 1500 - 18 * d);
        ping(hz);
        lastPingAt = now;
      }
      if (d < 5) {
        // Found it! Big chord + flash.
        ping(880); setTimeout(() => ping(1320), 80); setTimeout(() => ping(1760), 160);
        flashMini(`🏆 found! distance ${d.toFixed(1)} cm`, '#4ade80');
        stopEcho();
      }
    }, 80);
  }
  function stopEcho() {
    echoActive = false;
    if (echoTimer) clearInterval(echoTimer);
    echoTimer = null;
  }

  // ---- MAZE MODE ----------------------------------------------
  function startMaze() {
    // Bundle preset: low speed + tight wander threshold + narrow sweep.
    setRange('mqSpeedSlider',     130);
    setRange('mqWanderObstacle',  18);
    setRange('mqServoSweepFrom',  60);
    setRange('mqServoSweepTo',    120);
    setRange('mqServoSweepSpeed', 1800);
    flashMini('🧱 maze mode armed — kicking off auto-wander', '#fbbf24');
    // Click the auto-wander button. Idempotent — if already on, no-op.
    setTimeout(() => {
      const w = document.getElementById('mqDriveAutoWander');
      if (w) w.click();
    }, 250);
  }
  function setRange(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.setAttribute('value', String(value));
    el.value = String(value);
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ---- SOCCER -------------------------------------------------
  function loadSoccer() {
    let s = { red: 0, blue: 0 };
    try {
      const raw = localStorage.getItem('maqueen.soccer');
      if (raw) s = JSON.parse(raw);
    } catch {}
    return s;
  }
  function saveSoccer(s) {
    try { localStorage.setItem('maqueen.soccer', JSON.stringify(s)); } catch {}
  }
  function paintSoccer() {
    const s = loadSoccer();
    const r = document.getElementById('mqSoccerRed');
    const b = document.getElementById('mqSoccerBlue');
    if (r) r.textContent = s.red;
    if (b) b.textContent = s.blue;
  }
  function bumpSoccer(team) {
    const s = loadSoccer();
    s[team]++;
    saveSoccer(s);
    paintSoccer();
    // Tiny "GOAL!" flash.
    flashMini(`⚽ GOAL — ${team.toUpperCase()} ${s[team]}`, team === 'red' ? '#ef4444' : '#38bdf8');
  }
  function resetSoccer() {
    saveSoccer({ red: 0, blue: 0 });
    paintSoccer();
    flashMini('soccer match reset', 'var(--text-secondary, #93a8c4)');
  }

  // ---- shared status text ------------------------------------
  function flashMini(msg, color) {
    const el = document.getElementById('mqMiniStatus');
    if (!el) return;
    el.textContent = msg;
    el.style.color = color || 'var(--text-secondary, #93a8c4)';
    clearTimeout(flashMini._t);
    flashMini._t = setTimeout(() => { if (el) el.textContent = ''; }, 4000);
  }

  function init() {
    if (!document.getElementById('mqMiniGames')) return;
    paintSoccer();
    document.getElementById('mqEchoHuntBtn').addEventListener('click', () =>
      echoActive ? stopEcho() : startEcho());
    document.getElementById('mqMazeBtn').addEventListener('click', startMaze);
    const sBtn = document.getElementById('mqSoccerBtn');
    const sPanel = document.getElementById('mqSoccerPanel');
    if (sBtn) sBtn.addEventListener('click', () => {
      sPanel.style.display = (sPanel.style.display === 'none') ? 'block' : 'none';
    });
    document.getElementById('mqSoccerRedPlus' ).addEventListener('click', () => bumpSoccer('red'));
    document.getElementById('mqSoccerBluePlus').addEventListener('click', () => bumpSoccer('blue'));
    document.getElementById('mqSoccerReset'   ).addEventListener('click', resetSoccer);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
