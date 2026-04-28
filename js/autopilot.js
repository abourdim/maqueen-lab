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
// ============================================================
(function () {
  'use strict';

  const K_HEAD   = 1.4;
  const V_BASE   = 0.65;     // 0..1 fraction of speed slider
  const REACH_CM = 6;
  const SKIP_CM  = 4;
  const TICK_MS  = 100;

  let state = 'idle';        // 'idle' | 'draw' | 'run'
  let waypoints = [];        // [{x, y}] in robot world frame
  let runTimer = null;
  let svg, btn;

  function svgPointToWorld(evt) {
    // viewBox is "-100 -100 200 200" in cm world frame. Convert
    // pointer client coords → SVG coords → world cm.
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const local = pt.matrixTransform(ctm.inverse());
    // SVG Y is flipped relative to our world frame. mqOdometry stores
    // pose with x = lateral, y = forward, so we keep the SVG x as world x
    // and negate SVG y to map to world y. (See odometry render code.)
    return { x: local.x, y: -local.y };
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
    if (!waypoints.length) return;
    const pts = waypoints.map(p => `${p.x},${-p.y}`).join(' ');
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    poly.setAttribute('points', pts);
    poly.setAttribute('fill', 'none');
    poly.setAttribute('stroke', '#c084fc');
    poly.setAttribute('stroke-width', '1.5');
    poly.setAttribute('stroke-dasharray', '3,2');
    poly.setAttribute('vector-effect', 'non-scaling-stroke');
    g.appendChild(poly);
    // Endpoint marker.
    const end = waypoints[waypoints.length - 1];
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', end.x);
    c.setAttribute('cy', -end.y);
    c.setAttribute('r', '2');
    c.setAttribute('fill', '#c084fc');
    g.appendChild(c);
  }

  function clearPath() {
    const g = svg.querySelector('#mqAutopilotPath');
    if (g) g.remove();
  }

  // ---- DRAW MODE ----
  let drawing = false;
  function onPointerDown(e) {
    if (state !== 'draw') return;
    drawing = true;
    waypoints = [];
    const p = svgPointToWorld(e);
    if (p) { waypoints.push(p); paintPath(); }
    svg.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function onPointerMove(e) {
    if (state !== 'draw' || !drawing) return;
    const p = svgPointToWorld(e);
    if (!p) return;
    const last = waypoints[waypoints.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 2) {
      waypoints.push(p);
      paintPath();
    }
  }
  function onPointerUp(e) {
    if (state !== 'draw') return;
    drawing = false;
    try { svg.releasePointerCapture(e.pointerId); } catch {}
    if (waypoints.length < 2) {
      stop();
      return;
    }
    armRun();
  }

  function enterDraw() {
    state = 'draw';
    waypoints = [];
    clearPath();
    svg.style.cursor = 'crosshair';
    btn.classList.add('mq-autopilot-active');
    btn.firstChild.textContent = '🖍 ';
    btn.querySelector('span').textContent = 'drawing…';
    svg.addEventListener('pointerdown', onPointerDown);
    svg.addEventListener('pointermove', onPointerMove);
    svg.addEventListener('pointerup',   onPointerUp);
    svg.addEventListener('pointercancel', onPointerUp);
  }

  // ---- RUN MODE ----
  function armRun() {
    state = 'run';
    btn.querySelector('span').textContent = 'driving…';
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
    let err = bearing - pose.theta;
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
    btn.classList.remove('mq-autopilot-active');
    btn.firstChild.textContent = '🖍 ';
    const sp = btn.querySelector('span');
    if (sp) sp.textContent = 'draw & go';
    try { window.bleScheduler && window.bleScheduler.send('STOP').catch(() => {}); } catch {}
    // Leave the drawn path visible for a moment, then clear it.
    setTimeout(clearPath, 1500);
  }

  function init() {
    svg = document.getElementById('mqOdoSvg');
    btn = document.getElementById('mqAutopilotBtn');
    if (!svg || !btn) return;
    btn.addEventListener('click', () => state === 'idle' ? enterDraw() : stop());
    // Auto-cancel on BLE drop so a disconnected robot doesn't think it's
    // still on autopilot when reconnected.
    if (window.bleScheduler && window.bleScheduler.on) {
      window.bleScheduler.on('disconnected', () => { if (state !== 'idle') stop(); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
