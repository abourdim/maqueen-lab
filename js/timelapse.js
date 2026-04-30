// ============================================================
// timelapse.js — Export a 10× speed video of the trail + SLAM
// map evolving over time.
//
// Strategy: when the user clicks 🎬, we read the live trail and
// obstacles from mqOdometry, then render frames into an
// off-screen canvas — frame N draws the first ⌈N · stride⌉
// trail points plus all obstacles whose timestamp ≤ that
// frame's virtual time. captureStream + MediaRecorder produce
// a downloadable WebM.
//
// Auto-fits the bounding box of the trail with 10 % padding.
// Black bg + green trail + amber-to-red obstacles by distance.
// ============================================================
(function () {
  'use strict';

  const W       = 720;
  const H       = 720;
  const PAD     = 0.10;     // 10% bbox padding
  const FPS     = 30;
  const FRAMES  = 180;      // ~6 seconds output video
  // Color helpers identical to the radar legend used elsewhere.
  function obstColor(cm) {
    return cm < 10 ? '#ef4444'
         : cm < 30 ? '#fbbf24'
         : cm < 60 ? '#84cc16'
                   : '#22d3ee';
  }

  function bbox(trail) {
    if (!trail.length) return { minX: -50, maxX: 50, minY: -50, maxY: 50 };
    let minX = +Infinity, maxX = -Infinity, minY = +Infinity, maxY = -Infinity;
    for (const p of trail) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    // Square it up so circular trails render as circles, not ovals.
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const r  = Math.max(20, Math.max(maxX - minX, maxY - minY) / 2);
    return { minX: cx - r, maxX: cx + r, minY: cy - r, maxY: cy + r };
  }

  function paintFrame(ctx, trail, obstacles, n, total, box) {
    const padX = (box.maxX - box.minX) * PAD;
    const padY = (box.maxY - box.minY) * PAD;
    const x0 = box.minX - padX, x1 = box.maxX + padX;
    const y0 = box.minY - padY, y1 = box.maxY + padY;
    function tx(x) { return (x - x0) / (x1 - x0) * W; }
    function ty(y) { return H - (y - y0) / (y1 - y0) * H; }

    ctx.fillStyle = '#061121';
    ctx.fillRect(0, 0, W, H);

    // Subtle grid.
    ctx.strokeStyle = '#1d3556';
    ctx.lineWidth = 1;
    const step = Math.max(10, Math.round((x1 - x0) / 20 / 5) * 5);
    for (let xv = Math.ceil(x0 / step) * step; xv <= x1; xv += step) {
      ctx.beginPath(); ctx.moveTo(tx(xv), 0); ctx.lineTo(tx(xv), H); ctx.stroke();
    }
    for (let yv = Math.ceil(y0 / step) * step; yv <= y1; yv += step) {
      ctx.beginPath(); ctx.moveTo(0, ty(yv)); ctx.lineTo(W, ty(yv)); ctx.stroke();
    }

    // Trail up to current frame.
    const cutoff = Math.ceil((n + 1) / total * trail.length);
    if (cutoff > 1) {
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(tx(trail[0].x), ty(trail[0].y));
      for (let i = 1; i < cutoff; i++) ctx.lineTo(tx(trail[i].x), ty(trail[i].y));
      ctx.stroke();
      // Robot dot at the head.
      const head = trail[cutoff - 1];
      ctx.fillStyle = '#fb923c';
      ctx.beginPath(); ctx.arc(tx(head.x), ty(head.y), 6, 0, Math.PI * 2); ctx.fill();
    }

    // Obstacles whose timestamp is ≤ this virtual frame.
    if (obstacles.length) {
      const tMin = obstacles[0].t_ms || obstacles[0].t || 0;
      const tMax = obstacles[obstacles.length - 1].t_ms || obstacles[obstacles.length - 1].t || tMin;
      const range = Math.max(1, tMax - tMin);
      const tCut = tMin + (n / total) * range;
      for (const o of obstacles) {
        const ot = o.t_ms || o.t || 0;
        if (ot > tCut) continue;
        ctx.fillStyle = obstColor(o.cm);
        ctx.beginPath(); ctx.arc(tx(o.x), ty(o.y), 3.5, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Stamp.
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '14px JetBrains Mono, monospace';
    ctx.fillText('maqueen-lab · time-lapse', 20, H - 18);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText(`frame ${n + 1}/${total}`, 20, H - 38);
  }

  async function record() {
    if (!window.mqOdometry || !window.mqOdometry.getTrail) {
      alert('Drive the robot first to build a trail to export.');
      return;
    }
    const trail = window.mqOdometry.getTrail();
    const obstacles = window.mqOdometry.getObstacles();
    if (trail.length < 2) {
      alert('Need at least a few seconds of motion to make a time-lapse.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // captureStream + MediaRecorder. Try VP9 → VP8 → default.
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
    rec.start();

    // Render frames at FPS. We tick by setTimeout instead of rAF so
    // the speed is deterministic regardless of display refresh.
    for (let n = 0; n < FRAMES; n++) {
      paintFrame(ctx, trail, obstacles, n, FRAMES, box);
      await new Promise(r => setTimeout(r, 1000 / FPS));
    }
    // Hold the final frame for an extra half-second so YouTube/social
    // thumbnails grab the completed map, not a mid-trail blur.
    for (let n = 0; n < FPS / 2; n++) {
      paintFrame(ctx, trail, obstacles, FRAMES - 1, FRAMES, box);
      await new Promise(r => setTimeout(r, 1000 / FPS));
    }
    rec.stop();
    await done;
    const blob = new Blob(chunks, { type: 'video/webm' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'maqueen-lab-timelapse-' + Date.now() + '.webm';
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 0);
  }

  function init() {
    const btn = document.getElementById('mqTimelapseBtn');
    if (!btn) return;
    if (typeof MediaRecorder === 'undefined') {
      btn.disabled = true;
      btn.title = 'Time-lapse export needs MediaRecorder API (Chrome / Edge / Firefox).';
      return;
    }
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.classList.add('mq-btn-busy');
      try { await record(); }
      catch (e) { console.error(e); alert('Time-lapse failed: ' + e.message); }
      btn.disabled = false;
      btn.classList.remove('mq-btn-busy');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
