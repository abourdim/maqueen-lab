// ============================================================
// camera-inputs.js — 10 camera-driven joystick modes
// ============================================================
// Each install* function returns a teardown that:
//   - stops getUserMedia tracks (camera light off)
//   - stops the requestAnimationFrame loop
//   - empties the host element
// All functions take (host, fireVec, stop, sendVerb) where:
//   host    = DOM element to render the mode UI into
//   fireVec = (x, y) ∈ [-1,1] → app-side mix to M:L,R + send
//   stop    = () => send STOP
//   sendVerb= (verb) => send a raw verb like 'M:L,R' / 'STOP'
// ============================================================
(function () {
  'use strict';

  // ---- Shared camera stage (video + processing canvas) -----------
  async function makeStage(host, opts) {
    opts = opts || {};
    const W = opts.w || 320, H = opts.h || 240;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:10px;';
    const video = document.createElement('video');
    video.autoplay = true; video.muted = true; video.playsInline = true;
    video.style.cssText = 'width:' + W + 'px; height:' + H + 'px; border:2px solid var(--cyan); border-radius:14px; transform: scaleX(-1); background:var(--ink);';
    const overlay = document.createElement('canvas');
    overlay.width = W; overlay.height = H;
    overlay.style.cssText = 'pointer-events:none; margin-top:-' + H + 'px; transform: scaleX(-1); border-radius:14px;';
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    canvas.style.display = 'none';
    const status = document.createElement('div');
    status.style.cssText = 'color:var(--steel); font-size:0.85rem; min-height:1.2rem; text-align:center;';
    status.textContent = 'Requesting camera…';
    const hint = document.createElement('div');
    hint.style.cssText = 'color:var(--steel); font-size:0.82rem; max-width:380px; text-align:center;';
    if (opts.hint) hint.textContent = opts.hint;

    wrap.appendChild(video);
    wrap.appendChild(overlay);
    wrap.appendChild(canvas);
    wrap.appendChild(status);
    wrap.appendChild(hint);
    host.appendChild(wrap);

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: W, height: H, facingMode: 'user' } });
      video.srcObject = stream;
      await video.play().catch(() => {});
      status.textContent = '✓ Camera active';
      status.style.color = 'var(--neon)';
    } catch (e) {
      status.textContent = '✗ Camera blocked: ' + e.message;
      status.style.color = 'var(--danger)';
      return null;
    }
    return {
      video, canvas, overlay, status, hint,
      ctx: canvas.getContext('2d', { willReadFrequently: true }),
      octx: overlay.getContext('2d'),
      W, H,
      teardown: () => { try { stream.getTracks().forEach(t => t.stop()); } catch (e) {} }
    };
  }

  // ---- Mode 11: Color Tracker -------------------------------------
  async function installColorTrack(host, fireVec, stop) {
    host.innerHTML = '';
    const colorRow = document.createElement('div');
    colorRow.style.cssText = 'display:flex; gap:8px; margin-bottom:10px;';
    const COLORS = [
      { name: 'red',    h: 0,   s: 60, hex: '#ef4444' },
      { name: 'green',  h: 120, s: 50, hex: '#22c55e' },
      { name: 'blue',   h: 220, s: 60, hex: '#3b82f6' },
      { name: 'yellow', h: 55,  s: 55, hex: '#facc15' },
    ];
    let target = COLORS[0];
    COLORS.forEach(c => {
      const b = document.createElement('button');
      b.textContent = c.name;
      b.style.cssText = 'padding:6px 14px; border-radius:999px; border:2px solid ' + c.hex + '; background:rgba(0,0,0,0.2); color:' + c.hex + '; cursor:pointer; font-weight:700; text-transform:uppercase; font-size:11px;';
      b.addEventListener('click', () => { target = c; [...colorRow.children].forEach(x => x.style.background = 'rgba(0,0,0,0.2)'); b.style.background = c.hex; });
      colorRow.appendChild(b);
    });
    host.appendChild(colorRow);

    const stage = await makeStage(host, { hint: 'Show a colored object to the camera. Move it left/right to steer; closer = faster.' });
    if (!stage) return () => host.innerHTML = '';
    let raf;
    function tick() {
      stage.ctx.drawImage(stage.video, 0, 0, stage.W, stage.H);
      const img = stage.ctx.getImageData(0, 0, stage.W, stage.H);
      let sx = 0, sy = 0, n = 0;
      // Simple HSV match
      for (let i = 0; i < img.data.length; i += 4) {
        const r = img.data[i], g = img.data[i+1], b = img.data[i+2];
        const max = Math.max(r,g,b), min = Math.min(r,g,b);
        const v = max, d = max - min;
        if (v < 60) continue; // too dark
        const s = d / (max || 1) * 100;
        if (s < 30) continue; // too desaturated
        let h;
        if (d === 0) h = 0;
        else if (max === r) h = 60 * (((g - b) / d) % 6);
        else if (max === g) h = 60 * ((b - r) / d + 2);
        else h = 60 * ((r - g) / d + 4);
        if (h < 0) h += 360;
        const dh = Math.min(Math.abs(h - target.h), 360 - Math.abs(h - target.h));
        if (dh < 25 && s > target.s - 15) {
          const px = (i/4) % stage.W;
          const py = Math.floor((i/4) / stage.W);
          sx += px; sy += py; n++;
        }
      }
      stage.octx.clearRect(0, 0, stage.W, stage.H);
      if (n > 80) {
        const cx = sx / n, cy = sy / n;
        stage.octx.beginPath(); stage.octx.arc(cx, cy, 14, 0, Math.PI*2);
        stage.octx.strokeStyle = target.hex; stage.octx.lineWidth = 3; stage.octx.stroke();
        const xv = (cx / stage.W) * 2 - 1; // -1..1
        const speed = Math.min(1, n / 2000); // bigger blob = faster
        fireVec(-xv, speed); // mirror flip: video is mirrored
      } else {
        stop();
      }
      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => { cancelAnimationFrame(raf); stage.teardown(); host.innerHTML = ''; stop(); };
  }

  // ---- Mode 12: Face Steer (Chrome FaceDetector) ----------------
  async function installFaceSteer(host, fireVec, stop) {
    host.innerHTML = '';
    if (typeof FaceDetector === 'undefined') {
      host.innerHTML = '<div style="color:var(--amber); padding:20px; text-align:center;">FaceDetector API not available. Try Chrome / Edge on Android or with Shape Detection flags enabled on desktop.</div>';
      return () => host.innerHTML = '';
    }
    const stage = await makeStage(host, { hint: 'Move your head left/right to steer. Lean closer to go faster.' });
    if (!stage) return () => host.innerHTML = '';
    const detector = new FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
    let raf, busy = false;
    async function tick() {
      if (!busy) {
        busy = true;
        try {
          stage.ctx.drawImage(stage.video, 0, 0, stage.W, stage.H);
          const faces = await detector.detect(stage.canvas);
          stage.octx.clearRect(0, 0, stage.W, stage.H);
          if (faces.length) {
            const f = faces[0].boundingBox;
            stage.octx.strokeStyle = 'var(--neon)'; stage.octx.lineWidth = 2;
            stage.octx.strokeRect(f.x, f.y, f.width, f.height);
            const cx = f.x + f.width / 2;
            const xv = (cx / stage.W) * 2 - 1;
            // Distance proxy: face occupies fraction of frame width
            const closeness = Math.min(1, Math.max(0, (f.width / stage.W - 0.15) / 0.35));
            fireVec(-xv, closeness);
          } else {
            stop();
          }
        } catch (e) { /* ignore detect errors */ }
        busy = false;
      }
      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => { cancelAnimationFrame(raf); stage.teardown(); host.innerHTML = ''; stop(); };
  }

  // ---- Mode 13: Hand Wave (frame-diff blob) ---------------------
  async function installHandWave(host, fireVec, stop) {
    host.innerHTML = '';
    const stage = await makeStage(host, { hint: 'Wave a hand in front of the camera. The biggest motion blob steers the robot.' });
    if (!stage) return () => host.innerHTML = '';
    let prev = null, raf;
    function tick() {
      stage.ctx.drawImage(stage.video, 0, 0, stage.W, stage.H);
      const img = stage.ctx.getImageData(0, 0, stage.W, stage.H);
      stage.octx.clearRect(0, 0, stage.W, stage.H);
      if (prev) {
        let sx = 0, sy = 0, n = 0;
        for (let i = 0; i < img.data.length; i += 16) { // sample every 4 pixels
          const dr = Math.abs(img.data[i] - prev.data[i]);
          const dg = Math.abs(img.data[i+1] - prev.data[i+1]);
          const db = Math.abs(img.data[i+2] - prev.data[i+2]);
          if (dr + dg + db > 90) {
            const px = (i/4) % stage.W;
            const py = Math.floor((i/4) / stage.W);
            sx += px; sy += py; n++;
          }
        }
        if (n > 60) {
          const cx = sx / n, cy = sy / n;
          stage.octx.beginPath(); stage.octx.arc(cx, cy, 18, 0, Math.PI*2);
          stage.octx.strokeStyle = '#4ade80'; stage.octx.lineWidth = 3; stage.octx.stroke();
          const xv = (cx / stage.W) * 2 - 1;
          const yv = 1 - (cy / stage.H) * 2;
          fireVec(-xv, yv);
        } else {
          stop();
        }
      }
      prev = img;
      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => { cancelAnimationFrame(raf); stage.teardown(); host.innerHTML = ''; stop(); };
  }

  // ---- Mode 14: Light Sensor (avg luminance) --------------------
  async function installLightSensor(host, fireVec, stop) {
    host.innerHTML = '';
    const stage = await makeStage(host, { hint: 'Cover the camera = STOP. Bright light or open camera = full speed forward. Hold a flashlight for max!' });
    if (!stage) return () => host.innerHTML = '';
    const meter = document.createElement('div');
    meter.style.cssText = 'width:280px; height:14px; background:var(--bg-soft); border:1px solid var(--border); border-radius:7px; overflow:hidden; margin-top:6px;';
    const fill = document.createElement('div');
    fill.style.cssText = 'height:100%; width:0%; background:linear-gradient(90deg, var(--danger), var(--amber), var(--neon)); transition:width 0.1s;';
    meter.appendChild(fill);
    host.appendChild(meter);
    let raf;
    function tick() {
      stage.ctx.drawImage(stage.video, 0, 0, stage.W, stage.H);
      const img = stage.ctx.getImageData(0, 0, stage.W, stage.H);
      let sum = 0, count = 0;
      for (let i = 0; i < img.data.length; i += 16) {
        sum += img.data[i] * 0.299 + img.data[i+1] * 0.587 + img.data[i+2] * 0.114;
        count++;
      }
      const avg = sum / count / 255;  // 0..1
      fill.style.width = (avg * 100).toFixed(0) + '%';
      // Below 20% = stop, else throttle proportional
      if (avg < 0.2) stop();
      else fireVec(0, Math.min(1, (avg - 0.2) / 0.6));
      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => { cancelAnimationFrame(raf); stage.teardown(); host.innerHTML = ''; stop(); };
  }

  // ---- Mode 15: Card Reader (BarcodeDetector / QR) --------------
  async function installCardReader(host, fireVec, stop, sendVerb) {
    host.innerHTML = '';
    if (typeof BarcodeDetector === 'undefined') {
      host.innerHTML = '<div style="color:var(--amber); padding:20px; text-align:center;">BarcodeDetector API not available. Try Chrome / Edge on Android.</div>';
      return () => host.innerHTML = '';
    }
    // Show example QR cards user can print/photograph
    const cards = [
      { text: 'FORWARD',  fire: () => fireVec(0, 1) },
      { text: 'BACKWARD', fire: () => fireVec(0, -1) },
      { text: 'LEFT',     fire: () => fireVec(-1, 0) },
      { text: 'RIGHT',    fire: () => fireVec(1, 0) },
      { text: 'STOP',     fire: () => stop() },
    ];
    const cardRow = document.createElement('div');
    cardRow.style.cssText = 'display:flex; gap:6px; flex-wrap:wrap; justify-content:center; margin-bottom:8px; max-width:400px;';
    cards.forEach(c => {
      const div = document.createElement('div');
      div.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:2px; padding:8px; background:#fff; border-radius:6px; min-width:78px;';
      // Use https://api.qrserver.com pattern free QR (offline-friendly: encode locally with a tiny lib? skip — just show text label as fallback)
      div.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=70x70&data=' + c.text + '" width="70" height="70" alt=""><span style="color:#000; font-size:10px; font-weight:700;">' + c.text + '</span>';
      cardRow.appendChild(div);
    });
    host.appendChild(cardRow);
    const stage = await makeStage(host, { hint: 'Show one of these QR cards to the camera. Print them, or display on your phone screen.' });
    if (!stage) return () => host.innerHTML = '';
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    let raf, busy = false, lastCode = null, lastTime = 0;
    async function tick() {
      if (!busy) {
        busy = true;
        try {
          stage.ctx.drawImage(stage.video, 0, 0, stage.W, stage.H);
          const codes = await detector.detect(stage.canvas);
          stage.octx.clearRect(0, 0, stage.W, stage.H);
          if (codes.length) {
            const c = codes[0];
            const txt = c.rawValue.toUpperCase().trim();
            stage.octx.strokeStyle = '#4ade80'; stage.octx.lineWidth = 3;
            const cp = c.cornerPoints;
            stage.octx.beginPath();
            stage.octx.moveTo(cp[0].x, cp[0].y);
            for (let i = 1; i < cp.length; i++) stage.octx.lineTo(cp[i].x, cp[i].y);
            stage.octx.closePath(); stage.octx.stroke();
            stage.status.textContent = 'Read: ' + txt;
            const now = performance.now();
            if (txt !== lastCode || now - lastTime > 600) {
              const card = cards.find(x => x.text === txt);
              if (card) card.fire();
              lastCode = txt; lastTime = now;
            }
          }
        } catch (e) {}
        busy = false;
      }
      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => { cancelAnimationFrame(raf); stage.teardown(); host.innerHTML = ''; stop(); };
  }

  // ---- Mode 16: Mirror Mode (motion direction vector) -----------
  async function installMirror(host, fireVec, stop) {
    host.innerHTML = '';
    const stage = await makeStage(host, { hint: 'Move your hand any direction — the robot drives the same direction. Wave left → robot turns left.' });
    if (!stage) return () => host.innerHTML = '';
    let prevCx = null, prevCy = null, prevImg = null, raf;
    function tick() {
      stage.ctx.drawImage(stage.video, 0, 0, stage.W, stage.H);
      const img = stage.ctx.getImageData(0, 0, stage.W, stage.H);
      stage.octx.clearRect(0, 0, stage.W, stage.H);
      if (prevImg) {
        let sx = 0, sy = 0, n = 0;
        for (let i = 0; i < img.data.length; i += 16) {
          const d = Math.abs(img.data[i] - prevImg.data[i]) +
                    Math.abs(img.data[i+1] - prevImg.data[i+1]) +
                    Math.abs(img.data[i+2] - prevImg.data[i+2]);
          if (d > 90) {
            const px = (i/4) % stage.W; const py = Math.floor((i/4) / stage.W);
            sx += px; sy += py; n++;
          }
        }
        if (n > 60) {
          const cx = sx / n, cy = sy / n;
          if (prevCx !== null) {
            const dx = cx - prevCx, dy = cy - prevCy;
            const mag = Math.hypot(dx, dy);
            stage.octx.strokeStyle = '#38bdf8'; stage.octx.lineWidth = 3;
            stage.octx.beginPath(); stage.octx.moveTo(prevCx, prevCy); stage.octx.lineTo(cx, cy); stage.octx.stroke();
            if (mag > 4) {
              fireVec(-dx / 30, -dy / 30); // mirror x; up in frame = forward
            } else {
              stop();
            }
          }
          prevCx = cx; prevCy = cy;
        } else {
          prevCx = null; stop();
        }
      }
      prevImg = img;
      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => { cancelAnimationFrame(raf); stage.teardown(); host.innerHTML = ''; stop(); };
  }

  // ---- Mode 17: Two-Hand Tank (left half + right half blobs) ----
  async function installTwoHand(host, fireVec, stop, sendVerb) {
    host.innerHTML = '';
    const stage = await makeStage(host, { hint: 'Each hand controls one wheel. Raise left hand = drive left motor; raise right hand = drive right motor.' });
    if (!stage) return () => host.innerHTML = '';
    let prevImg = null, raf;
    function tick() {
      stage.ctx.drawImage(stage.video, 0, 0, stage.W, stage.H);
      const img = stage.ctx.getImageData(0, 0, stage.W, stage.H);
      stage.octx.clearRect(0, 0, stage.W, stage.H);
      // Vertical line separating left/right halves (mirrored)
      stage.octx.strokeStyle = 'rgba(56,189,248,0.4)'; stage.octx.lineWidth = 1;
      stage.octx.beginPath(); stage.octx.moveTo(stage.W/2, 0); stage.octx.lineTo(stage.W/2, stage.H); stage.octx.stroke();
      if (prevImg) {
        // For each half, compute motion centroid and average Y (high in frame = high speed)
        const halves = [{xMin:0, xMax:stage.W/2, sy:0, n:0, cx:0}, {xMin:stage.W/2, xMax:stage.W, sy:0, n:0, cx:0}];
        for (let i = 0; i < img.data.length; i += 16) {
          const d = Math.abs(img.data[i] - prevImg.data[i]) +
                    Math.abs(img.data[i+1] - prevImg.data[i+1]) +
                    Math.abs(img.data[i+2] - prevImg.data[i+2]);
          if (d < 80) continue;
          const px = (i/4) % stage.W; const py = Math.floor((i/4) / stage.W);
          for (const h of halves) {
            if (px >= h.xMin && px < h.xMax) { h.sy += py; h.cx += px; h.n++; break; }
          }
        }
        function speedFor(half) {
          if (half.n < 30) return 0;
          const avgY = half.sy / half.n;
          return Math.max(-1, Math.min(1, 1 - (avgY / stage.H) * 2));
        }
        // NOTE: video is mirrored; left in frame = right hand
        const rightSpeed = speedFor(halves[0]); // frame's left half = your right hand
        const leftSpeed  = speedFor(halves[1]);
        // Mark blobs
        halves.forEach((h, i) => { if (h.n > 30) {
          stage.octx.beginPath(); stage.octx.arc(h.cx/h.n, h.sy/h.n, 14, 0, Math.PI*2);
          stage.octx.strokeStyle = '#4ade80'; stage.octx.lineWidth = 3; stage.octx.stroke();
        }});
        if (Math.abs(leftSpeed) < 0.05 && Math.abs(rightSpeed) < 0.05) stop();
        else { const ms = 200; const L = Math.round(leftSpeed * ms), R = Math.round(rightSpeed * ms); sendVerb('M:' + L + ',' + R); }
      }
      prevImg = img;
      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => { cancelAnimationFrame(raf); stage.teardown(); host.innerHTML = ''; stop(); };
  }

  // ---- Mode 18: Pose (TF.js MoveNet, lazy-loaded) --------------
  async function installPose(host, fireVec, stop) {
    host.innerHTML = '';
    const loader = document.createElement('div');
    loader.style.cssText = 'color:var(--steel); padding:20px; text-align:center;';
    loader.textContent = 'Loading TensorFlow + MoveNet (≈3 MB, one-time)…';
    host.appendChild(loader);
    function loadScript(src) {
      return new Promise((resolve, reject) => {
        if ([...document.scripts].some(s => s.src === src)) { resolve(); return; }
        const s = document.createElement('script'); s.src = src;
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    try {
      await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js');
      await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js');
    } catch (e) {
      loader.textContent = '✗ Could not load pose-detection model (offline?).';
      loader.style.color = 'var(--danger)';
      return () => host.innerHTML = '';
    }
    loader.remove();
    const stage = await makeStage(host, { hint: 'Both hands UP = forward. Left hand UP only = turn left. Right UP only = turn right. Hands DOWN = stop.' });
    if (!stage) return () => host.innerHTML = '';
    const detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING });
    let raf, busy = false;
    async function tick() {
      if (!busy) {
        busy = true;
        try {
          const poses = await detector.estimatePoses(stage.video, { flipHorizontal: false });
          stage.octx.clearRect(0, 0, stage.W, stage.H);
          if (poses.length) {
            const kp = poses[0].keypoints;
            const pick = n => kp.find(p => p.name === n);
            const lw = pick('left_wrist'), rw = pick('right_wrist');
            const ls = pick('left_shoulder'), rs = pick('right_shoulder');
            // Draw the 4 keypoints
            [lw, rw, ls, rs].forEach(p => {
              if (p && p.score > 0.3) {
                stage.octx.beginPath(); stage.octx.arc(p.x, p.y, 6, 0, Math.PI*2);
                stage.octx.fillStyle = '#4ade80'; stage.octx.fill();
              }
            });
            const lUp = lw && ls && lw.score > 0.3 && ls.score > 0.3 && lw.y < ls.y - 30;
            const rUp = rw && rs && rw.score > 0.3 && rs.score > 0.3 && rw.y < rs.y - 30;
            if (lUp && rUp) fireVec(0, 1);
            else if (lUp) fireVec(-1, 0);
            else if (rUp) fireVec(1, 0);
            else stop();
          }
        } catch (e) {}
        busy = false;
      }
      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => { cancelAnimationFrame(raf); stage.teardown(); host.innerHTML = ''; stop(); };
  }

  // ---- Mode 19: Lean Forward (face size = throttle) ------------
  async function installLean(host, fireVec, stop) {
    host.innerHTML = '';
    if (typeof FaceDetector === 'undefined') {
      host.innerHTML = '<div style="color:var(--amber); padding:20px; text-align:center;">FaceDetector API not available. Try Chrome on Android.</div>';
      return () => host.innerHTML = '';
    }
    const stage = await makeStage(host, { hint: 'Lean closer to the camera = faster forward. Lean back = slow / stop. Tilt head left/right to steer.' });
    if (!stage) return () => host.innerHTML = '';
    const detector = new FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
    let raf, busy = false;
    async function tick() {
      if (!busy) {
        busy = true;
        try {
          stage.ctx.drawImage(stage.video, 0, 0, stage.W, stage.H);
          const faces = await detector.detect(stage.canvas);
          stage.octx.clearRect(0, 0, stage.W, stage.H);
          if (faces.length) {
            const f = faces[0].boundingBox;
            stage.octx.strokeStyle = '#fbbf24'; stage.octx.lineWidth = 2;
            stage.octx.strokeRect(f.x, f.y, f.width, f.height);
            const widthFrac = f.width / stage.W;
            // Baseline 25% of frame = 0 throttle. 60% = full forward. Below 20% = stop.
            const throttle = Math.max(0, Math.min(1, (widthFrac - 0.25) / 0.35));
            const cx = f.x + f.width/2;
            const xv = (cx / stage.W) * 2 - 1;
            if (throttle < 0.05) stop(); else fireVec(-xv * 0.6, throttle);
          } else stop();
        } catch (e) {}
        busy = false;
      }
      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => { cancelAnimationFrame(raf); stage.teardown(); host.innerHTML = ''; stop(); };
  }

  // ---- Mode 20: Color Wand (color trail → replay path) ---------
  async function installColorWand(host, fireVec, stop, sendVerb) {
    host.innerHTML = '';
    const stage = await makeStage(host, { hint: 'Wave a colored object — the camera traces its path. Click "Replay" and the robot follows it.' });
    if (!stage) return () => host.innerHTML = '';
    const ctrl = document.createElement('div');
    ctrl.style.cssText = 'display:flex; gap:8px; margin-top:8px;';
    const target = { h: 0 }; // red default
    ['red','green','blue','yellow'].forEach((name, i) => {
      const h = [0, 120, 220, 55][i];
      const b = document.createElement('button');
      b.textContent = name;
      b.style.cssText = 'padding:5px 10px; border-radius:8px; border:1px solid var(--border); background:var(--bg-soft); color:var(--text); cursor:pointer; font-size:11px;';
      b.addEventListener('click', () => { target.h = h; });
      ctrl.appendChild(b);
    });
    const replayBtn = document.createElement('button');
    replayBtn.textContent = '▶ Replay path';
    replayBtn.style.cssText = 'padding:5px 14px; border-radius:8px; border:1.5px solid var(--neon); background:rgba(74,222,128,0.1); color:var(--neon); cursor:pointer; font-weight:700;';
    const clearBtn = document.createElement('button');
    clearBtn.textContent = '🗑 Clear';
    clearBtn.style.cssText = 'padding:5px 14px; border-radius:8px; border:1px solid var(--border); background:var(--bg-soft); color:var(--text); cursor:pointer;';
    ctrl.appendChild(replayBtn); ctrl.appendChild(clearBtn);
    host.appendChild(ctrl);
    const trail = [];
    let raf;
    clearBtn.addEventListener('click', () => { trail.length = 0; });
    replayBtn.addEventListener('click', async () => {
      if (trail.length < 2) return;
      let prev = trail[0];
      for (let i = 1; i < trail.length; i++) {
        const dx = trail[i].x - prev.x, dy = trail[i].y - prev.y;
        const ms = 200, len = Math.hypot(dx, dy);
        if (len > 4) {
          const ang = Math.atan2(dy, dx);
          const yv = -Math.cos(ang - Math.PI / 2);
          const xv = Math.sin(ang - Math.PI / 2);
          fireVec(xv, yv);
          await new Promise(r => setTimeout(r, Math.min(400, len * 6)));
        }
        prev = trail[i];
      }
      stop();
    });
    function tick() {
      stage.ctx.drawImage(stage.video, 0, 0, stage.W, stage.H);
      const img = stage.ctx.getImageData(0, 0, stage.W, stage.H);
      let sx=0, sy=0, n=0;
      for (let i = 0; i < img.data.length; i += 16) {
        const r = img.data[i], g = img.data[i+1], b = img.data[i+2];
        const max = Math.max(r,g,b), min = Math.min(r,g,b), v = max, d = max - min;
        if (v < 60) continue;
        const sat = d / (max || 1) * 100;
        if (sat < 30) continue;
        let h;
        if (d === 0) h = 0;
        else if (max === r) h = 60 * (((g - b) / d) % 6);
        else if (max === g) h = 60 * ((b - r) / d + 2);
        else h = 60 * ((r - g) / d + 4);
        if (h < 0) h += 360;
        const dh = Math.min(Math.abs(h - target.h), 360 - Math.abs(h - target.h));
        if (dh < 25) {
          const px = (i/4) % stage.W; const py = Math.floor((i/4) / stage.W);
          sx += px; sy += py; n++;
        }
      }
      stage.octx.clearRect(0, 0, stage.W, stage.H);
      if (n > 80) {
        const cx = sx/n, cy = sy/n;
        trail.push({x: cx, y: cy});
        if (trail.length > 200) trail.shift();
      }
      // draw trail
      stage.octx.strokeStyle = '#4ade80'; stage.octx.lineWidth = 2;
      stage.octx.beginPath();
      trail.forEach((p, i) => i === 0 ? stage.octx.moveTo(p.x, p.y) : stage.octx.lineTo(p.x, p.y));
      stage.octx.stroke();
      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => { cancelAnimationFrame(raf); stage.teardown(); host.innerHTML = ''; stop(); };
  }

  // ---- Public registry ------------------------------------------
  window.CameraInputs = {
    colortrack: { title: 'Color Tracker',  sub: 'Pick a color, wave a matching object — robot follows the blob.',                  install: installColorTrack },
    facesteer:  { title: 'Face Steer',     sub: 'Move your head left/right to steer; lean closer to go faster (Chrome only).',       install: installFaceSteer },
    handwave:   { title: 'Hand Wave',      sub: 'Wave a hand in front of the camera — the biggest motion blob drives the robot.',   install: installHandWave },
    light:      { title: 'Light Sensor',   sub: 'Cover camera = STOP. Bright light or torch = full speed forward.',                  install: installLightSensor },
    cards:      { title: 'Card Reader',    sub: 'Show printed QR cards (FORWARD / LEFT / RIGHT / BACK / STOP) to drive (Chrome only).', install: installCardReader },
    mirror:     { title: 'Mirror Mode',    sub: 'Robot drives the same direction as your hand motion in the camera.',               install: installMirror },
    twohand:    { title: 'Two-Hand Tank',  sub: 'Left hand position controls left wheel, right hand controls right wheel.',          install: installTwoHand },
    pose:       { title: 'Pose',           sub: 'Both arms UP = forward, left UP = left turn, right UP = right turn (TF.js MoveNet).', install: installPose },
    lean:       { title: 'Lean Forward',   sub: 'Lean closer to the camera = faster. Tilt head left/right to steer (Chrome only).',  install: installLean },
    colorwand:  { title: 'Color Wand',     sub: 'Camera traces a colored object\'s path; click Replay to make the robot follow.',     install: installColorWand },
  };
})();
