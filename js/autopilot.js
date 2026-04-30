// ============================================================
// autopilot.js — Drag-to-trace autopilot.
//
// User clicks 🖍 → enters DRAW mode. They finger-paint a path on
// the SLAM SVG (#mqOdoSvg). Releasing the pointer arms a follower
// that drives the robot along the captured waypoints using a
// simple proportional controller over the live odometry pose.
//
// Algorithm per tick (~10 Hz):
//   target = next unreached waypoint (skip those within 4 cm)
//   bearing = atan2(target.x − pose.x, target.y − pose.y)
//   error   = bearing − pose.theta, normalized to [−π, π]
//   ω = clamp(K_HEAD · error, −1, 1)
//   v = max(0, V_BASE · cos(error))   // slow when wrong-aimed
//   M:L,R = (v + ω·base/2, v − ω·base/2)
//
// Stops at last waypoint (within 6 cm) or when the user clicks
// 🖍 again. Cancels cleanly on BLE disconnect.
//
// Save / Replay:
//   origWaypoints keeps the full unmodified copy so the user can
//   💾 save after the run finishes and 🔁 replay without re-drawing.
// ============================================================
(function () {
  'use strict';

  const K_HEAD   = 1.4;
  const V_BASE   = 0.65;     // 0..1 fraction of speed slider
  const REACH_CM = 6;
  const SKIP_CM  = 4;
  const TICK_MS  = 100;

  let state = 'idle';        // 'idle' | 'draw' | 'run'
  let waypoints = [];        // [{x, y}] working copy — consumed during run
  let origWaypoints = [];    // unchanged master copy for save / replay
  let runTimer = null;
  let svg, btn;

  function svgPointToWorld(evt) {
    // The odometry SVG renders at world_cm * scale, so SVG coords are NOT
    // in cm. Divide by the current auto-scale to get world cm, which is the
    // same unit that mqOdometry.getPose() returns.
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const local = pt.matrixTransform(ctm.inverse());
    const scale = (window.mqOdometry && window.mqOdometry.getScale) ? window.mqOdometry.getScale() : 1;
    return { x: local.x / scale, y: -local.y / scale };
  }

  function paintPath() {
    // Inject (or update) a polyline showing the captured path.
    let g = svg.querySelector('#mqAutopilotPath');
    if (!g) {
      g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('id', 'mqAutopilotPath');
      svg.appendChild(g);
    }
    g.innerHTML = '';
    // Use origWaypoints so the path stays visible during and after the run.
    if (!origWaypoints.length) return;
    const scale = (window.mqOdometry && window.mqOdometry.getScale) ? window.mqOdometry.getScale() : 1;
    const pts = origWaypoints.map(p => `${(p.x * scale).toFixed(1)},${(-p.y * scale).toFixed(1)}`).join(' ');
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    poly.setAttribute('points', pts);
    poly.setAttribute('fill', 'none');
    poly.setAttribute('stroke', '#c084fc');
    poly.setAttribute('stroke-width', '1.5');
    poly.setAttribute('stroke-dasharray', '3,2');
    poly.setAttribute('vector-effect', 'non-scaling-stroke');
    g.appendChild(poly);
    // Endpoint marker.
    const end = origWaypoints[origWaypoints.length - 1];
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', (end.x * scale).toFixed(1));
    c.setAttribute('cy', (-end.y * scale).toFixed(1));
    c.setAttribute('r', '2');
    c.setAttribute('fill', '#c084fc');
    g.appendChild(c);
  }

  function clearPath() {
    const g = svg.querySelector('#mqAutopilotPath');
    if (g) g.remove();
  }

  // ---- SAVE / LOAD / REPLAY ------------------------------------
  function showIoBtns(visible) {
    // The whole ap-io bar slides in as one unit below the main button row.
    const bar = document.getElementById('mqApIoBar');
    if (bar) bar.style.display = visible ? '' : 'none';
  }

  function savePath() {
    if (!origWaypoints.length) return;
    const json = JSON.stringify({ v: 1, waypoints: origWaypoints }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'chemin-' + new Date().toISOString().slice(0, 10) + '.json';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function loadPath(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.waypoints || !Array.isArray(data.waypoints)) throw new Error('invalid');
        origWaypoints = data.waypoints;
        waypoints = origWaypoints.map(p => ({ ...p }));
        paintPath();
        showIoBtns(true);
        // Auto-arm: go straight to run mode so user just watches.
        if (waypoints.length >= 2) armRun();
      } catch { alert('Fichier invalide — JSON attendu avec "waypoints".'); }
    };
    reader.readAsText(file);
  }

  function replayPath() {
    if (!origWaypoints.length) return;
    if (state === 'run') return;   // already running — let it finish
    // If stuck in draw mode, clean up first.
    if (state !== 'idle') {
      state = 'idle';
      drawing = false;
      svg.style.cursor = '';
      svg.removeEventListener('pointerdown', onPointerDown);
      svg.removeEventListener('pointermove', onPointerMove);
      svg.removeEventListener('pointerup',   onPointerUp);
      svg.removeEventListener('pointercancel', onPointerUp);
      btn.classList.remove('mq-autopilot-drawing');
    }
    // Fresh copy of the original waypoints, then run.
    waypoints = origWaypoints.map(p => ({ ...p }));
    paintPath();
    armRun();
  }

  // ---- DRAW MODE ----
  let drawing = false;
  function onPointerDown(e) {
    if (state !== 'draw') return;
    drawing = true;
    origWaypoints = [];
    waypoints = [];
    const p = svgPointToWorld(e);
    if (p) { origWaypoints.push(p); waypoints.push(p); paintPath(); }
    svg.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function onPointerMove(e) {
    if (state !== 'draw' || !drawing) return;
    const p = svgPointToWorld(e);
    if (!p) return;
    const last = origWaypoints[origWaypoints.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 2) {
      origWaypoints.push(p);
      waypoints.push(p);
      paintPath();
    }
  }
  function onPointerUp(e) {
    if (state !== 'draw') return;
    drawing = false;
    try { svg.releasePointerCapture(e.pointerId); } catch {}
    if (origWaypoints.length < 2) {
      stop();
      return;
    }
    showIoBtns(true);   // path captured — expose 💾, 📂, 🔁
    armRun();
  }

  function enterDraw() {
    state = 'draw';
    origWaypoints = [];
    waypoints = [];
    clearPath();
    svg.style.cursor = 'crosshair';
    btn.classList.add('mq-autopilot-active', 'mq-autopilot-drawing');
    svg.addEventListener('pointerdown', onPointerDown);
    svg.addEventListener('pointermove', onPointerMove);
    svg.addEventListener('pointerup',   onPointerUp);
    svg.addEventListener('pointercancel', onPointerUp);
  }

  // ---- RUN MODE ----
  function armRun() {
    state = 'run';
    btn.classList.remove('mq-autopilot-drawing');
    btn.classList.add('mq-autopilot-active', 'mq-autopilot-running');
    runTimer = setInterval(tick, TICK_MS);
  }

  function tick() {
    if (state !== 'run') return;
    if (!window.bleScheduler) { stop(); return; }
    const odo = window.mqOdometry;
    if (!odo || !odo.getPose) { stop(); return; }
    const pose = odo.getPose();
    // Drop reached / nearby waypoints from the front.
    while (waypoints.length && Math.hypot(waypoints[0].x - pose.x, waypoints[0].y - pose.y) < SKIP_CM) {
      waypoints.shift();
    }
    if (!waypoints.length) {
      // Final stop — within REACH_CM of the (now-empty) goal.
      try { window.bleScheduler?.clearCoalesced('M'); } catch {}
      try { window.bleScheduler.send('STOP').catch(() => {}); } catch {}
      stop();
      return;
    }
    const tgt = waypoints[0];
    // Bearing in robot frame: angle to target in world coords minus
    // heading. World convention here: theta = 0 → facing +y (forward),
    // theta increases turning LEFT. Match mqOdometry's integration.
    const dx = tgt.x - pose.x, dy = tgt.y - pose.y;
    const bearing = Math.atan2(dx, dy);     // 0 = forward, +π/2 = right
    // Heading source: compass-locked (drift-free) if user toggled
    // 🎚 LOCK on AND a fresh HEAD: reply is available; otherwise
    // wheel-integrated theta (legacy behavior preserved).
    let theta = pose.theta;
    if (window.mqHeading && window.mqHeading.isLocked() && window.mqHeading.isFresh()) {
      // Compass returns 0..360 with 0 = North = +y forward. Convert to
      // theta in mqOdometry's convention (theta=0 is +y, +theta turns
      // robot toward +x = compass-degrees-decreasing). So theta_compass
      // = -compassDeg (rad).
      theta = -window.mqHeading.get() * Math.PI / 180;
    }
    let err = bearing - theta;
    while (err >  Math.PI) err -= 2 * Math.PI;
    while (err < -Math.PI) err += 2 * Math.PI;
    let omega = K_HEAD * err;
    if (omega >  1) omega =  1;
    if (omega < -1) omega = -1;
    let v = Math.max(0, V_BASE * Math.cos(err));
    // BLE M:L,R units. Differential mix.
    //
    // Sign convention (cross-checked against mqOdometry integration):
    //   theta integration: x += v·sin(theta)·dt, y += v·cos(theta)·dt
    //   omega from wheels:  omega = (vL − vR) / WHEELBASE
    //   → vL > vR means omega > 0 means theta grows means robot turns
    //     toward +x (i.e., right when looking from above with +y forward).
    //
    // So to turn right (target with +dx), we need vL > vR. With err > 0
    // (target right), our K_HEAD makes omega > 0, and we want L = base+turn,
    // R = base-turn. This is the OPPOSITE of the keypad data-l/data-r
    // labels — those are robot-frame motor outputs, not "left wheel power".
    const slider = document.getElementById('mqSpeedSlider');
    const speed = slider ? +slider.value : 200;
    const base  = v * speed;
    const turn  = omega * speed * 0.5;
    const L = Math.round(base + turn);   // err > 0 (target right) → L faster
    const R = Math.round(base - turn);   //                          R slower
    try { window.bleScheduler.send(`M:${L},${R}`, { coalesce: true }).catch(() => {}); } catch {}
    // Feed odometry so pose updates and waypoint-reach detection works.
    // Autopilot bypasses fireDrive(), so we must call update() directly.
    try { window.mqOdometry && window.mqOdometry.update(L, R); } catch {}
  }

  function stop() {
    state = 'idle';
    drawing = false;
    if (runTimer) clearInterval(runTimer);
    runTimer = null;
    svg.style.cursor = '';
    svg.removeEventListener('pointerdown', onPointerDown);
    svg.removeEventListener('pointermove', onPointerMove);
    svg.removeEventListener('pointerup',   onPointerUp);
    svg.removeEventListener('pointercancel', onPointerUp);
    btn.classList.remove('mq-autopilot-active', 'mq-autopilot-drawing', 'mq-autopilot-running');
    try { window.bleScheduler?.clearCoalesced('M'); } catch {}
    try { window.bleScheduler && window.bleScheduler.send('STOP').catch(() => {}); } catch {}
    try { window.mqOdometry && window.mqOdometry.update(0, 0); } catch {}
    // Leave the drawn path visible for a moment, then clear it.
    setTimeout(clearPath, 1500);
  }

  function init() {
    svg = document.getElementById('mqOdoSvg');
    btn = document.getElementById('mqAutopilotBtn');
    if (!svg || !btn) return;
    btn.addEventListener('click', () => state === 'idle' ? enterDraw() : stop());
    document.getElementById('mqAutopilotSave')?.addEventListener('click', savePath);
    document.getElementById('mqAutopilotReplay')?.addEventListener('click', replayPath);
    const loadInput = document.getElementById('mqAutopilotLoad');
    if (loadInput) loadInput.addEventListener('change', e => { loadPath(e.target.files[0]); e.target.value = ''; });
    // Auto-cancel on BLE drop so a disconnected robot doesn't think it's
    // still on autopilot when reconnected. Use retry so this survives any
    // future script-order changes (defensive pattern from maqueen-tab.js).
    function wireAutopilotDisconnect() {
      if (!window.bleScheduler || !window.bleScheduler.on) {
        setTimeout(wireAutopilotDisconnect, 100); return;
      }
      window.bleScheduler.on('disconnected', () => { if (state !== 'idle') stop(); });
    }
    wireAutopilotDisconnect();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
