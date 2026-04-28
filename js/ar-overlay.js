// ============================================================
// ar-overlay.js — Phone camera + sensor HUD overlay.
//
// Asks for camera permission (rear-facing preferred), shows the
// live video full-screen, and paints a heads-up display with the
// current sonar distance, line state, and heading. A crosshair +
// dynamic ring visualize the sonar reading: ring radius shrinks
// as the obstacle gets closer.
//
// Geometry caveat: we don't know the camera's field of view in cm,
// so the ring's relationship to the real obstacle is schematic
// (a feel-it readout, not a measurement). The HUD numbers are
// truthful — those come straight from BLE.
// ============================================================
(function () {
  'use strict';

  let stream  = null;
  let raf     = null;
  let modal, video, canvas, ctx;

  function readNum(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    const m = (el.textContent || '').match(/-?\d+(\.\d+)?/);
    return m ? +m[0] : null;
  }
  function readLineState() {
    const l = document.getElementById('mq-line-l');
    const r = document.getElementById('mq-line-r');
    if (!l || !r) return '—';
    const lOn = l.style.background && /4ade80|fbbf24|f87171/.test(l.style.background);
    const rOn = r.style.background && /4ade80|fbbf24|f87171/.test(r.style.background);
    return (lOn ? '●' : '○') + (rOn ? '●' : '○');
  }

  function distFromHud() {
    // Existing readouts: #mq-dist ("xx cm" or "—") and dashboard sonar.
    const fromStrip = readNum('mq-dist');
    if (fromStrip != null) return fromStrip;
    const fromDash  = readNum('mqDashSonar');
    return fromDash;
  }
  function headingFromOdo() {
    if (window.mqOdometry && window.mqOdometry.getPose) {
      const p = window.mqOdometry.getPose();
      return Math.round(p.theta * 180 / Math.PI);
    }
    return null;
  }

  function render() {
    if (!modal || modal.style.display === 'none') return;
    const w = canvas.width  = canvas.clientWidth;
    const h = canvas.height = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    // Crosshair.
    ctx.strokeStyle = 'rgba(74,222,128,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 30, cy); ctx.lineTo(cx - 8,  cy);
    ctx.moveTo(cx + 8,  cy); ctx.lineTo(cx + 30, cy);
    ctx.moveTo(cx, cy - 30); ctx.lineTo(cx, cy - 8);
    ctx.moveTo(cx, cy + 8);  ctx.lineTo(cx, cy + 30);
    ctx.stroke();
    // Sonar ring — radius scales inversely with distance (close = big).
    const dist = distFromHud();
    if (dist != null && dist > 0) {
      const maxR = Math.min(w, h) * 0.35;
      const norm = Math.max(0.05, Math.min(1, 1 - dist / 100));    // 0..1
      const r = maxR * norm;
      const color = dist < 10 ? '#ef4444'
                  : dist < 30 ? '#fbbf24'
                  : dist < 60 ? '#84cc16'
                              : '#22d3ee';
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = '16px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(dist + ' cm', cx, cy + r + 22);
    }
    // HUD text update.
    const dEl = document.getElementById('mqArDist');
    const lEl = document.getElementById('mqArLine');
    const hEl = document.getElementById('mqArHeading');
    if (dEl) dEl.textContent = (dist != null ? dist : '—');
    if (lEl) lEl.textContent = readLineState();
    if (hEl) {
      const h_ = headingFromOdo();
      hEl.textContent = (h_ != null ? h_ : '—');
    }
    raf = requestAnimationFrame(render);
  }

  async function open() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Camera not available on this browser.');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
    } catch (e) {
      alert('Camera permission denied or unavailable: ' + e.message);
      return;
    }
    video.srcObject = stream;
    modal.style.display = 'flex';
    render();
  }
  function close() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    if (video) video.srcObject = null;
    if (modal) modal.style.display = 'none';
  }

  function init() {
    modal  = document.getElementById('mqArModal');
    video  = document.getElementById('mqArVideo');
    canvas = document.getElementById('mqArOverlay');
    if (!modal || !video || !canvas) return;
    ctx = canvas.getContext('2d');
    const open_ = document.getElementById('mqArBtn');
    if (open_) open_.addEventListener('click', open);
    document.getElementById('mqArClose').addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.style.display === 'flex') close();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
