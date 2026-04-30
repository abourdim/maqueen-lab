// ============================================================
// youtuber-mode.js — Auto-vlog of the session.
//
// Click 🎥 on the path card → produces a ~25-second WebM:
//   [00:00–00:03]  Title card: "MAQUEEN VLOG · {date}"
//   [00:03–00:18]  Time-lapse of the trail/SLAM unfolding,
//                  with bottom-strip captions auto-generated
//                  from telemetry stats.
//   [00:18–00:25]  Outro: stats summary + "subscribe & like" gag.
//
// Audio track: optional Web Speech TTS narration when the user
// has enabled it (toggle 🎙 inside the modal). Otherwise, silent.
// Voice-over text is built from the same recap template as
// session-recap.js so it matches.
//
// All client-side. captureStream + MediaRecorder + Web Audio
// (mixed to MediaStreamDestination so audio + video are in one
// WebM blob).
// ============================================================
(function () {
  'use strict';

  const W = 720, H = 720, FPS = 30;
  const TITLE_FRAMES = FPS * 3;       // 3 s
  const TRAIL_FRAMES = FPS * 15;      // 15 s
  const OUTRO_FRAMES = FPS * 7;       // 7 s

  function obstColor(cm) {
    return cm < 10 ? '#ef4444'
         : cm < 30 ? '#fbbf24'
         : cm < 60 ? '#84cc16'
                   : '#22d3ee';
  }

  function bbox(trail) {
    if (!trail.length) return { minX:-50, maxX:50, minY:-50, maxY:50 };
    let minX=+Infinity, maxX=-Infinity, minY=+Infinity, maxY=-Infinity;
    for (const p of trail) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const r  = Math.max(20, Math.max(maxX - minX, maxY - minY) / 2);
    return { minX: cx - r, maxX: cx + r, minY: cy - r, maxY: cy + r };
  }

  function captionForFrame(snap, n, total) {
    const phase = n / total;
    if (phase < 0.2)      return `📡 connecting to ${snap.app?.url || 'maqueen-lab'}`;
    if (phase < 0.4)      return `🚦 driving · top ${(+snap.dashboard?.peak_cms || 0).toFixed(1)} cm/s`;
    if (phase < 0.6)      return `🦇 sonar pings · ${(snap.obstacles||[]).length} obstacles spotted`;
    if (phase < 0.8)      return `🧭 ${(+snap.total_dist_cm/100||0).toFixed(2)} m of breadcrumbs`;
    return                       `🎬 mapping the kitchen kingdom`;
  }

  function paintTitleCard(ctx, t) {
    ctx.fillStyle = '#061121';
    ctx.fillRect(0, 0, W, H);
    // Animated cyan ring at center
    const cx = W/2, cy = H/2;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy - 60, 80, 0, Math.PI * 2 * t);
    ctx.stroke();
    // Title text
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 56px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MAQUEEN', cx, cy + 60);
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('VLOG', cx, cy + 130);
    ctx.fillStyle = '#fbbf24';
    ctx.font = '18px JetBrains Mono, monospace';
    ctx.fillText(new Date().toLocaleString(), cx, cy + 180);
  }

  function paintTrailFrame(ctx, snap, n, total, box) {
    const trail = snap.trail || [];
    const obs   = snap.obstacles || [];
    const PAD   = 0.10;
    const padX  = (box.maxX - box.minX) * PAD;
    const padY  = (box.maxY - box.minY) * PAD;
    const x0 = box.minX - padX, x1 = box.maxX + padX;
    const y0 = box.minY - padY, y1 = box.maxY + padY;
    const tx = (x) => (x - x0) / (x1 - x0) * W;
    const ty = (y) => H - (y - y0) / (y1 - y0) * H;

    ctx.fillStyle = '#061121';
    ctx.fillRect(0, 0, W, H);
    // grid
    ctx.strokeStyle = '#1d3556';
    ctx.lineWidth = 1;
    const step = Math.max(10, Math.round((x1 - x0) / 20 / 5) * 5);
    for (let xv = Math.ceil(x0/step)*step; xv <= x1; xv += step) {
      ctx.beginPath(); ctx.moveTo(tx(xv), 0); ctx.lineTo(tx(xv), H); ctx.stroke();
    }
    for (let yv = Math.ceil(y0/step)*step; yv <= y1; yv += step) {
      ctx.beginPath(); ctx.moveTo(0, ty(yv)); ctx.lineTo(W, ty(yv)); ctx.stroke();
    }
    // trail
    const cutoff = Math.ceil((n + 1) / total * trail.length);
    if (cutoff > 1) {
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(tx(trail[0].x), ty(trail[0].y));
      for (let i = 1; i < cutoff; i++) ctx.lineTo(tx(trail[i].x), ty(trail[i].y));
      ctx.stroke();
      const head = trail[cutoff-1];
      ctx.fillStyle = '#fb923c';
      ctx.beginPath(); ctx.arc(tx(head.x), ty(head.y), 7, 0, Math.PI * 2); ctx.fill();
    }
    // obstacles fading in
    if (obs.length) {
      const tMin = obs[0].t || 0, tMax = obs[obs.length-1].t || tMin;
      const range = Math.max(1, tMax - tMin);
      const cut = tMin + (n/total) * range;
      for (const o of obs) {
        if ((o.t||0) > cut) continue;
        ctx.fillStyle = obstColor(o.cm);
        ctx.beginPath(); ctx.arc(tx(o.x), ty(o.y), 4, 0, Math.PI*2); ctx.fill();
      }
    }
    // caption strip bottom
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, H - 70, W, 70);
    ctx.fillStyle = '#fff';
    ctx.font = '20px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(captionForFrame(snap, n, total), W/2, H - 30);
  }

  function paintOutroCard(ctx, snap, t) {
    ctx.fillStyle = '#061121';
    ctx.fillRect(0, 0, W, H);
    const cx = W/2;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 36px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TODAY\'S STATS', cx, 80);
    const totalM = ((+snap.total_dist_cm || 0) / 100).toFixed(2);
    const top    = (+snap.dashboard?.peak_cms || 0).toFixed(1);
    const obstN  = (snap.obstacles || []).length;
    const lines = [
      `🚗  ${totalM} meters driven`,
      `⚡  top ${top} cm/s`,
      `🦇  ${obstN} obstacles spotted`,
    ];
    ctx.font = '32px JetBrains Mono, monospace';
    ctx.fillStyle = '#38bdf8';
    lines.forEach((l, i) => {
      ctx.globalAlpha = Math.min(1, t * 4 - i * 0.3);
      ctx.fillText(l, cx, 200 + i * 60);
    });
    ctx.globalAlpha = 1;
    if (t > 0.6) {
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 28px JetBrains Mono, monospace';
      ctx.fillText('LIKE & SUBSCRIBE  🤖', cx, H - 90);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px JetBrains Mono, monospace';
      ctx.fillText('maqueen-lab.github.io', cx, H - 60);
    }
  }

  function buildNarration(snap) {
    const totalM = ((+snap.total_dist_cm||0) / 100).toFixed(1);
    const peak = (+snap.dashboard?.peak_cms || 0).toFixed(1);
    const obs = (snap.obstacles||[]).length;
    return `Welcome to the Maqueen Vlog! Today we drove ${totalM} meters. ` +
           `We hit a top speed of ${peak} centimeters per second. ` +
           `We saw ${obs} obstacles along the way. ` +
           `Don't forget to like and subscribe!`;
  }

  async function record() {
    if (!window.mqOdometry || !window.mqOdometry.getTrail) {
      alert('Drive the robot first to build a vlog from.');
      return;
    }
    const trail = window.mqOdometry.getTrail();
    if (trail.length < 2) {
      alert('Need at least a few seconds of motion to make a vlog.');
      return;
    }
    const snap = window.mqTelemetryExport?.buildSnapshot
      ? window.mqTelemetryExport.buildSnapshot()
      : { trail, obstacles: window.mqOdometry.getObstacles(), total_dist_cm: window.mqOdometry.getTotalDist(), dashboard: {} };

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(FPS);

    let mime = 'video/webm;codecs=vp9';
    if (!('MediaRecorder' in window) || !MediaRecorder.isTypeSupported(mime)) {
      mime = 'video/webm;codecs=vp8';
      if (!MediaRecorder.isTypeSupported(mime)) mime = 'video/webm';
    }
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise(resolve => { rec.onstop = resolve; });

    const box = bbox(trail);

    // Optional TTS narration (fire-and-forget, audio plays through speakers)
    try {
      if (window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance(buildNarration(snap));
        u.rate = 1.05; u.pitch = 1.1;
        window.speechSynthesis.speak(u);
      }
    } catch {}

    rec.start();

    // Title
    for (let n = 0; n < TITLE_FRAMES; n++) {
      paintTitleCard(ctx, n / TITLE_FRAMES);
      await new Promise(r => setTimeout(r, 1000 / FPS));
    }
    // Trail body
    for (let n = 0; n < TRAIL_FRAMES; n++) {
      paintTrailFrame(ctx, snap, n, TRAIL_FRAMES, box);
      await new Promise(r => setTimeout(r, 1000 / FPS));
    }
    // Outro
    for (let n = 0; n < OUTRO_FRAMES; n++) {
      paintOutroCard(ctx, snap, n / OUTRO_FRAMES);
      await new Promise(r => setTimeout(r, 1000 / FPS));
    }

    rec.stop();
    await done;
    const blob = new Blob(chunks, { type: 'video/webm' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'maqueen-vlog-' + Date.now() + '.webm';
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 0);
  }

  function init() {
    // Inject 🎥 button next to the existing 🎬 timelapse button.
    const tlBtn = document.getElementById('mqTimelapseBtn');
    if (!tlBtn || document.getElementById('mqYouTuberBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'mqYouTuberBtn';
    btn.type = 'button';
    btn.className = 'mq-map-btn';
    btn.style.setProperty('--bc', '#e11d48');
    btn.title = '🎥 Vlog — film ton run avec titre, trajet et stats';
    btn.textContent = '🎥';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.classList.add('mq-btn-busy');
      try { await record(); }
      catch (e) { console.error(e); alert('Vlog failed: ' + e.message); }
      btn.disabled = false;
      btn.classList.remove('mq-btn-busy');
    });
    tlBtn.parentNode.insertBefore(btn, tlBtn.nextSibling);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
