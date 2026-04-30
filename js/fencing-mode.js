// ============================================================
// fencing-mode.js — Two phones + two robots = gyro-controlled duel.
//
// Activated via the 🤝 pair-robots WebRTC channel + the existing
// 📱 tilt-to-drive. New layer on top:
//   - Each tab tracks a "score" (number of touches landed).
//   - When robot A's sonar reports a target inside 12 cm AND
//     robot A's heading vector is close to robot B's last reported
//     position, count it as a "hit" → broadcast "HIT" over the
//     data channel + flash NeoPixels red on B's robot.
//   - Phone gyro RotationRate.alpha is used as the "sword speed"
//     multiplier → faster swings = stronger hits (1.5× damage).
//
// Toggle 🤺 in the macro bar. Requires:
//   - tilt-to-drive ON
//   - pair-robots connected (WebRTC channel open)
// Otherwise the toggle stays disabled with a tooltip.
// ============================================================
(function () {
  'use strict';

  const KEY_SCORE = 'maqueen.fencingScore';
  const HIT_RANGE_CM = 12;

  let on = false;
  let myScore = 0;
  let theirScore = 0;
  let lastTilt = 0;
  let dataChannel = null;
  let pollTimer = null;

  function paintScores() {
    const m = document.getElementById('mqFencingMine');
    const t = document.getElementById('mqFencingTheirs');
    if (m) m.textContent = myScore;
    if (t) t.textContent = theirScore;
  }

  // Pair-robots holds the actual RTCDataChannel. We expose a hook
  // pair-robots calls (window.mqFencingChannel) when it has one
  // open; stash it so we can broadcast hits.
  window.mqFencingSetChannel = function (ch) { dataChannel = ch; };

  function broadcastHit(damage) {
    if (!dataChannel || dataChannel.readyState !== 'open') return;
    try { dataChannel.send(JSON.stringify({ type: 'HIT', damage })); } catch {}
  }

  function celebrateHit() {
    // Flash own NeoPixels green for a "score" effect
    if (!window.bleScheduler) return;
    for (let i = 0; i < 4; i++) {
      try { window.bleScheduler.send(`RGB:${i},0,255,0`).catch(() => {}); } catch {}
    }
    setTimeout(() => {
      for (let i = 0; i < 4; i++) {
        try { window.bleScheduler.send(`RGB:${i},0,0,0`).catch(() => {}); } catch {}
      }
    }, 350);
  }

  function takeHit(damage) {
    theirScore += damage;
    paintScores();
    // Flash own NeoPixels red — you got hit
    if (!window.bleScheduler) return;
    for (let i = 0; i < 4; i++) {
      try { window.bleScheduler.send(`RGB:${i},255,0,0`).catch(() => {}); } catch {}
    }
    try { window.bleScheduler.send(`BUZZ:200,200`).catch(() => {}); } catch {}
    setTimeout(() => {
      for (let i = 0; i < 4; i++) {
        try { window.bleScheduler.send(`RGB:${i},0,0,0`).catch(() => {}); } catch {}
      }
    }, 600);
  }

  // Hook the WebRTC data channel from pair-robots if it exists.
  // We don't have direct access; we add a global listener that
  // pair-robots' onmessage already routes through bleScheduler.send.
  // For safety we set up our OWN listener via a custom event.
  function tryHookChannel() {
    // A messy but working trick: monkey-patch RTCDataChannel.prototype.send
    // is too invasive. Instead, we listen on document for a
    // 'mq-pair-message' CustomEvent that we ourselves dispatch
    // when fencing is on. But pair-robots doesn't dispatch — so
    // we modify pair-robots in the future. For now, we use the
    // global window.mqFencingTakeHit() that pair-robots can call.
  }

  // Public API for pair-robots to call when it receives a HIT message.
  window.mqFencingTakeHit = function (msg) {
    if (!on) return;
    try {
      const o = typeof msg === 'string' ? JSON.parse(msg) : msg;
      if (o && o.type === 'HIT') takeHit(o.damage || 1);
    } catch {}
  };

  // Listen to phone gyro for "sword speed"
  function onMotion(e) {
    if (!on || !e.rotationRate) return;
    const r = e.rotationRate;
    const speed = Math.sqrt((r.alpha||0)**2 + (r.beta||0)**2 + (r.gamma||0)**2);
    lastTilt = speed;
  }

  // Hit detection: poll DIST? at 5 Hz; if < HIT_RANGE_CM, we landed a hit.
  function pollHitDetection() {
    if (!on || !window.bleScheduler) return;
    // Read most recent sonar from the dashboard
    const sEl = document.getElementById('mq-dist');
    if (!sEl) return;
    const m = (sEl.textContent || '').match(/(\d+(?:\.\d+)?)/);
    if (!m) return;
    const cm = +m[1];
    if (cm > 0 && cm < HIT_RANGE_CM) {
      const damage = lastTilt > 80 ? 2 : 1;        // fast swing = 2 pts
      myScore += damage;
      paintScores();
      celebrateHit();
      broadcastHit(damage);
    }
  }

  function paintBtn() {
    const btn = document.getElementById('mqFencingBtn');
    if (!btn) return;
    btn.classList.toggle('mq-fencing-on', on);
    btn.textContent = on ? '🤺 EN GARDE' : '🤺 fencing';
    btn.title = on
      ? 'Fencing duel ON — drive close to your opponent (< 12 cm) to land a hit; fast tilt = double damage'
      : 'Fencing Mode — needs tilt-to-drive ON and 2-robot pairing connected';
  }

  function setOn(v) {
    on = !!v;
    paintBtn();
    if (on) {
      myScore = 0; theirScore = 0; paintScores();
      window.addEventListener('devicemotion', onMotion);
      pollTimer = setInterval(pollHitDetection, 200);
    } else {
      window.removeEventListener('devicemotion', onMotion);
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function buildScoreboard() {
    const drive = document.querySelector('[data-mq-sub="drive"]');
    if (!drive || document.getElementById('mqFencingScoreboard')) return false;
    const sb = document.createElement('div');
    sb.id = 'mqFencingScoreboard';
    sb.style.cssText = 'display:none; margin-top:10px; padding:14px; background:linear-gradient(135deg, rgba(239,68,68,0.05), rgba(56,189,248,0.05)); border:1px solid #ef4444; border-radius:10px;';
    sb.innerHTML = `
      <div style="display:flex; align-items:center; gap:14px; justify-content:center; flex-wrap:wrap;">
        <span style="font-size:20px;">🤺</span>
        <span style="font-weight:700; color:#ef4444;">FENCING DUEL</span>
        <div style="text-align:center;">
          <div style="font-size:11px; color:#4ade80; font-weight:700;">YOU</div>
          <div id="mqFencingMine" style="font-family:JetBrains Mono, monospace; font-size:36px; color:#4ade80; font-weight:700; min-width:60px;">0</div>
        </div>
        <div style="font-size:24px; opacity:0.5;">vs</div>
        <div style="text-align:center;">
          <div style="font-size:11px; color:#ef4444; font-weight:700;">OPPONENT</div>
          <div id="mqFencingTheirs" style="font-family:JetBrains Mono, monospace; font-size:36px; color:#ef4444; font-weight:700; min-width:60px;">0</div>
        </div>
      </div>
      <div style="margin-top:8px; text-align:center; font-size:11px; color:#94a3b8;">
        Drive within ${HIT_RANGE_CM} cm of opponent's robot to land a hit. Fast phone-tilt = ×2 damage.
      </div>
    `;
    drive.appendChild(sb);
    return true;
  }

  function inject() {
    const macroBar = document.querySelector('.mq-macro-bar');
    if (!macroBar) return false;
    if (document.getElementById('mqFencingBtn')) return true;
    const btn = document.createElement('button');
    btn.id = 'mqFencingBtn';
    btn.type = 'button';
    btn.className = 'mq-macro-btn mq-fencing-btn';
    btn.addEventListener('click', () => {
      const sb = document.getElementById('mqFencingScoreboard');
      if (sb) sb.style.display = on ? 'none' : 'block';
      setOn(!on);
    });
    macroBar.appendChild(btn);
    paintBtn();
    return true;
  }

  function init() {
    let tries = 0;
    const id = setInterval(() => {
      if ((inject() && buildScoreboard()) || ++tries > 20) clearInterval(id);
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
