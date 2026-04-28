// ============================================================
// session-recap.js — Spotify-Wrapped-style summary of a run.
//
// Reads the live telemetry snapshot (mqTelemetryExport.buildSnapshot)
// and synthesizes a short narrative paragraph deterministically.
// No LLM required — works offline. An optional ✨ AI polish button
// rewrites the text via the Claude API if a key is in
// localStorage.maqueen.claudeKey.
//
// We deliberately don't ship a key. Users provide their own via
//   localStorage.setItem('maqueen.claudeKey', 'sk-ant-...')
// (small power-user feature — most kids will use the local recap).
// ============================================================
(function () {
  'use strict';

  function num(v, dp) {
    if (v == null || isNaN(+v)) return null;
    return +(+v).toFixed(dp || 0);
  }

  function buildText() {
    const snap = (window.mqTelemetryExport && window.mqTelemetryExport.buildSnapshot)
      ? window.mqTelemetryExport.buildSnapshot()
      : null;
    if (!snap) return 'Telemetry not ready — try driving the robot first.';

    const totalCm  = num(snap.total_dist_cm, 1) || 0;
    const totalM   = (totalCm / 100).toFixed(2);
    const trail    = (snap.trail || []).length;
    const obstN    = (snap.obstacles || []).length;
    const peakCms  = num(snap.dashboard?.peak_cms, 1);
    const avgCms   = num(snap.dashboard?.avg_cms,  1);
    const heading  = num(snap.pose?.theta_deg, 0);
    const x        = num(snap.pose?.x_cm, 0);
    const y        = num(snap.pose?.y_cm, 0);
    // Simple superlatives keyed off the numbers.
    let vibe = '';
    if (totalCm < 50)        vibe = 'a very short outing';
    else if (totalCm < 200)  vibe = 'a friendly little drive';
    else if (totalCm < 1000) vibe = 'a serious cruise';
    else                     vibe = 'an EPIC adventure';

    // Closest obstacle, for flavor.
    let closest = null;
    for (const o of (snap.obstacles || [])) {
      if (closest == null || o.cm < closest) closest = o.cm;
    }

    const personality = snap.settings?.['maqueen.personality'];
    const persoLine = personality
      ? `Your robot was set to "${personality}" mode — that's the character it ran today.`
      : '';

    return [
      `🤖  Today, your Maqueen had ${vibe} — ${totalM} m of total ground covered (${totalCm} cm).`,
      trail ? `It logged ${trail} trail points, like little breadcrumbs across the floor.` : '',
      peakCms ? `Top speed: ${peakCms} cm/s. Average: ${avgCms || '—'} cm/s.` : '',
      obstN ? `It noticed ${obstN} obstacles along the way${closest != null ? `, with the closest pinging at ${closest} cm` : ''}.` : '',
      (x != null && y != null) ? `Final pose: (${x}, ${y}) cm, heading ${heading}°.` : '',
      persoLine,
      `Tip: try the ${randomTip()} tab next!`,
    ].filter(Boolean).join('\n\n');
  }

  function randomTip() {
    const tips = [
      'Servos PWM Lab',
      'Drive Auto-wander with a tighter obstacle margin',
      'Distance > Sweep radar (try the Stars marker style)',
      'NeoPixels Simon Says',
      'Buzzer Buzz the Tune',
      'Path > 60 s SLAM run',
    ];
    return tips[Math.floor(Math.random() * tips.length)];
  }

  function paint(text) {
    const el = document.getElementById('mqRecapBody');
    if (el) el.textContent = text;
  }

  async function aiPolish() {
    let key = '';
    try { key = localStorage.getItem('maqueen.claudeKey') || ''; } catch {}
    if (!key) {
      const k = prompt(
        'Paste your Claude API key (starts with sk-ant-…). ' +
        'It will be stored in this browser only (localStorage.maqueen.claudeKey).');
      if (!k) return;
      key = k.trim();
      try { localStorage.setItem('maqueen.claudeKey', key); } catch {}
    }
    const original = document.getElementById('mqRecapBody').textContent;
    paint(original + '\n\n✨ rewriting with Claude…');
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
          max_tokens: 400,
          messages: [{
            role: 'user',
            content:
              'Rewrite this kid-friendly robot session recap in a fun, energetic ' +
              'Spotify-Wrapped voice (3-5 short paragraphs, emoji ok, ' +
              'preserve the numbers). Just return the text, no preamble.\n\n' +
              original,
          }],
        }),
      });
      const j = await res.json();
      if (j.error) { paint(original + '\n\n✗ ' + j.error.message); return; }
      const txt = j.content?.[0]?.text || original;
      paint(txt);
    } catch (e) {
      paint(original + '\n\n✗ ' + e.message);
    }
  }

  function open() {
    paint(buildText());
    const m = document.getElementById('mqRecapModal');
    if (m) m.style.display = 'flex';
  }
  function close() {
    const m = document.getElementById('mqRecapModal');
    if (m) m.style.display = 'none';
  }

  function init() {
    const btn = document.getElementById('mqRecapBtn');
    if (btn) btn.addEventListener('click', open);
    const closeBtn = document.getElementById('mqRecapClose');
    if (closeBtn) closeBtn.addEventListener('click', close);
    const copy = document.getElementById('mqRecapCopy');
    if (copy) copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(document.getElementById('mqRecapBody').textContent); copy.textContent = '✓ copied'; setTimeout(() => copy.textContent = '📋 Copy', 1400); }
      catch {}
    });
    const ai = document.getElementById('mqRecapAi');
    if (ai) ai.addEventListener('click', aiPolish);
    const m = document.getElementById('mqRecapModal');
    if (m) m.addEventListener('click', e => { if (e.target === m) close(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && m && m.style.display === 'flex') close();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
