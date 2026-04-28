// ============================================================
// gesture-control.js — Webcam hand-tracking → drive commands.
//
// Toggle 👋 in the Drive macro bar. When ON:
//   - getUserMedia front camera (mirrored, like a webcam selfie).
//   - Loads MediaPipe Hands via TF.js from CDN on demand.
//   - Detects a single hand, classifies the pose every frame:
//       👍 thumbs-up         → forward
//       👎 thumbs-down       → reverse
//       👈 palm-left tilt    → turn left
//       👉 palm-right tilt   → turn right
//       ✊ closed fist       → STOP
//       ✋ open palm idle    → STOP
//   - Sends the matching keypad action via existing buttons.
//
// Lazy-loaded: the ~3 MB TF.js + Hands models are only fetched
// when the toggle is ON — page load is unaffected.
// ============================================================
(function () {
  'use strict';

  const KEY = 'maqueen.gestureOn';

  let on = false;
  let stream = null;
  let video = null;
  let canvas = null;
  let ctx = null;
  let modelReady = false;
  let lastAction = null;
  let lastActionAt = 0;
  let raf = null;
  let detector = null;        // TFJS handpose detector

  const SCRIPTS = [
    'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core@4.10.0/dist/tf-core.min.js',
    'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-converter@4.10.0/dist/tf-converter.min.js',
    'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl@4.10.0/dist/tf-backend-webgl.min.js',
    'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js',
    'https://cdn.jsdelivr.net/npm/@tensorflow-models/hand-pose-detection@2.0.1/dist/hand-pose-detection.min.js',
  ];

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed: ' + src));
      document.head.appendChild(s);
    });
  }

  async function ensureModel() {
    if (modelReady) return;
    paintStatus('loading model…');
    try {
      for (const s of SCRIPTS) {
        if (!document.querySelector(`script[src="${s}"]`)) await loadScript(s);
      }
      const handPose = window.handPoseDetection;
      detector = await handPose.createDetector(handPose.SupportedModels.MediaPipeHands, {
        runtime: 'mediapipe',
        modelType: 'lite',
        solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240',
      });
      modelReady = true;
      paintStatus('hands tracking');
    } catch (e) {
      paintStatus('model failed: ' + e.message);
      throw e;
    }
  }

  // Classify a single hand into one of our actions based on landmark
  // geometry. landmarks are 21 (x,y,z) keypoints in image-relative coords.
  function classify(lm) {
    if (!lm || lm.length < 21) return null;
    // Helpers
    const tip = (i) => lm[i];
    const T = tip(4), I = tip(8), M = tip(12), R = tip(16), P = tip(20);
    const wrist = lm[0];
    // Finger "extended" heuristic: tip y must be above (smaller y) than its base
    const ext = (tipIdx, baseIdx) => lm[tipIdx].y < lm[baseIdx].y - 0.02;
    const indexExt  = ext(8,  6);
    const middleExt = ext(12, 10);
    const ringExt   = ext(16, 14);
    const pinkyExt  = ext(20, 18);
    const fingersExt = [indexExt, middleExt, ringExt, pinkyExt].filter(Boolean).length;

    // Thumbs-up / thumbs-down: thumb tip far from wrist on Y axis,
    // other fingers folded.
    const thumbAbove = T.y < wrist.y - 0.10;
    const thumbBelow = T.y > wrist.y + 0.10;
    if (fingersExt === 0 && thumbAbove) return 'forward';
    if (fingersExt === 0 && thumbBelow) return 'reverse';

    // Closed fist (no fingers extended, thumb roughly inline) = STOP
    if (fingersExt === 0) return 'stop';

    // Open palm (4 fingers extended) = STOP
    if (fingersExt >= 3) {
      // Tilt: index tip x vs pinky tip x
      const dx = I.x - P.x;
      if (Math.abs(dx) > 0.18) return dx > 0 ? 'right' : 'left';
      return 'stop';
    }
    return null;
  }

  function dispatch(action) {
    const now = performance.now();
    // Debounce: fire each action at most every 350 ms
    if (action === lastAction && (now - lastActionAt) < 350) return;
    if (now - lastActionAt < 120) return;
    lastAction = action; lastActionAt = now;
    const map = { forward:'w', reverse:'s', left:'a', right:'d', stop:' ' };
    const key = map[action];
    if (!key) return;
    const sel = `.mq-drive-btn[data-key="${key}"]`;
    const btn = document.querySelector(sel);
    if (btn) btn.click();
    paintStatus(action.toUpperCase());
  }

  async function tick() {
    if (!on || !modelReady || !video || video.readyState < 2) {
      raf = requestAnimationFrame(tick);
      return;
    }
    try {
      const hands = await detector.estimateHands(video, { flipHorizontal: true });
      // Paint webcam-tiny preview overlay
      paintPreview(hands);
      if (hands.length) {
        const a = classify(hands[0].keypoints.map(k => ({ x:k.x/video.videoWidth, y:k.y/video.videoHeight, z:0 })));
        if (a) dispatch(a);
      }
    } catch {}
    raf = requestAnimationFrame(tick);
  }

  function paintPreview(hands) {
    if (!ctx) return;
    canvas.width = 160; canvas.height = 120;
    ctx.save();
    ctx.scale(-1, 1);   // mirror
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();
    if (hands.length) {
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 1;
      const k = hands[0].keypoints;
      for (let i = 0; i < k.length; i++) {
        const x = canvas.width - k[i].x / video.videoWidth * canvas.width;
        const y = k[i].y / video.videoHeight * canvas.height;
        ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function paintStatus(msg) {
    const el = document.getElementById('mqGestureStatus');
    if (el) el.textContent = msg;
  }

  async function start() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false });
    } catch (e) {
      alert('Camera permission denied: ' + e.message);
      return;
    }
    if (!video) {
      const wrap = document.createElement('div');
      wrap.id = 'mqGesturePreview';
      wrap.style.cssText = 'position:fixed; bottom:80px; right:16px; z-index:9990; background:#000; padding:6px; border:2px solid #22d3ee; border-radius:8px; box-shadow:0 6px 16px rgba(0,0,0,0.5); font-family:JetBrains Mono, monospace; font-size:11px; color:#22d3ee;';
      video = document.createElement('video');
      video.autoplay = true; video.playsInline = true; video.muted = true;
      video.style.cssText = 'display:none;';
      canvas = document.createElement('canvas');
      canvas.style.cssText = 'display:block; width:160px; height:120px; border-radius:6px;';
      ctx = canvas.getContext('2d');
      const status = document.createElement('div');
      status.id = 'mqGestureStatus';
      status.style.cssText = 'text-align:center; margin-top:4px; min-height:14px;';
      wrap.appendChild(video);
      wrap.appendChild(canvas);
      wrap.appendChild(status);
      document.body.appendChild(wrap);
    }
    video.srcObject = stream;
    document.getElementById('mqGesturePreview').style.display = 'block';
    on = true;
    paintBtn();
    try { await ensureModel(); }
    catch { stop(); return; }
    tick();
  }
  function stop() {
    on = false;
    paintBtn();
    if (raf) cancelAnimationFrame(raf); raf = null;
    if (stream) stream.getTracks().forEach(t => t.stop()); stream = null;
    if (video) video.srcObject = null;
    const wrap = document.getElementById('mqGesturePreview');
    if (wrap) wrap.style.display = 'none';
  }

  function paintBtn() {
    const btn = document.getElementById('mqGestureBtn');
    if (!btn) return;
    btn.classList.toggle('mq-gesture-on', on);
    btn.textContent = on ? '👋 ON' : '👋 hands';
    btn.title = on
      ? 'Hand gesture control ON — wave at the webcam to drive'
      : 'Gesture control: webcam tracks hand pose → drive commands';
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch {}
  }

  function inject() {
    const macroBar = document.querySelector('.mq-macro-bar');
    if (!macroBar) return false;
    if (document.getElementById('mqGestureBtn')) return true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return true;
    const btn = document.createElement('button');
    btn.id = 'mqGestureBtn';
    btn.type = 'button';
    btn.className = 'mq-macro-btn mq-gesture-btn';
    btn.addEventListener('click', () => on ? stop() : start());
    macroBar.appendChild(btn);
    paintBtn();
    return true;
  }

  function init() {
    if (!inject()) {
      let tries = 0;
      const id = setInterval(() => {
        if (inject() || ++tries > 20) clearInterval(id);
      }, 200);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
