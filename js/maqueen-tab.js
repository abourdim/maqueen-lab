// ============================================================
// maqueen-tab.js — wires every control on the Maqueen tab
//
// All sends go through window.bleScheduler (sequence + echo).
// Reads stay live via the panel strip up top (maqueen-panel.js).
// ============================================================

(function () {
  'use strict';

  // -------- helpers ---------------------------------------
  // Returns the scheduler promise so callers can await echo confirmation.
  // Internal callers that don't care just ignore the return value.
  const send = (verb) => {
    if (!window.bleScheduler) {
      console.warn('[maqueen-tab] no scheduler', verb);
      return Promise.resolve(null);
    }
    return window.bleScheduler.send(verb).catch(err => {
      console.warn('[maqueen-tab]', verb, err.message);
      return null;
    });
  };
  const sendCoalesced = (verb, prefix) => {
    if (!window.bleScheduler) return;
    window.bleScheduler.send(verb, { coalesce: true }).catch(() => {});
  };
  const hexToRGB = (hex) => {
    const h = hex.replace('#', '');
    return {
      r: parseInt(h.substr(0, 2), 16),
      g: parseInt(h.substr(2, 2), 16),
      b: parseInt(h.substr(4, 2), 16),
    };
  };

  // -------- DRIVE -----------------------------------------
  let speed = 200;
  // Track the last direction so the slider can re-issue M: live while moving
  let lastDir = null;   // { l, r } or null after STOP
  function setLastVerb(verb) {
    const el = document.getElementById('mqDriveLastVerb');
    if (el) {
      el.textContent = verb;
      el.style.opacity = '1';
      // brief flash
      el.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 250 });
    }
  }
  // mascot/wheels share these; updated by every fireDrive() so the SVG
  // visualisation stays honest (== last command actually sent).
  let _lastSentL = 0, _lastSentR = 0;

  // -------- LIVE ANATOMY MIRROR ---------------------------
  // The anatomy mini-map in the card header is a live mirror of the
  // robot. Every action / sensor update echoes there so the user
  // builds a spatial map: 'this control = THAT part of the robot'.
  // Each helper is best-effort: if the SVG element is missing
  // (older HTML), the call is a no-op.
  function pulse(id, color, ms) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.color = color;   // sets currentColor for drop-shadow
    el.classList.remove('mq-anat-pulse');
    void el.offsetWidth;
    el.classList.add('mq-anat-pulse');
    if (ms) setTimeout(() => el.classList.remove('mq-anat-pulse'), ms);
  }
  const mqAnat = {
    led(idx, on) {
      const el = document.getElementById(idx === 0 || idx === '0' ? 'mqAnatLedL' : 'mqAnatLedR');
      if (!el) return;
      el.setAttribute('fill', on ? '#facc15' : '#0a1628');
      el.style.filter = on ? 'drop-shadow(0 0 6px #facc15)' : '';
    },
    line(l, r) {
      const eL = document.getElementById('mqAnatLineL');
      const eR = document.getElementById('mqAnatLineR');
      if (eL) {
        eL.setAttribute('fill', +l === 0 ? '#facc15' : '#0a1628');
        eL.style.filter = +l === 0 ? 'drop-shadow(0 0 5px #facc15)' : '';
      }
      if (eR) {
        eR.setAttribute('fill', +r === 0 ? '#facc15' : '#0a1628');
        eR.style.filter = +r === 0 ? 'drop-shadow(0 0 5px #facc15)' : '';
      }
    },
    sonar() { pulse('mqAnatSonar', '#4ade80', 600); },
    ir()    { pulse('mqAnatIR',    '#c084fc', 600); },
    servo(port) {
      pulse(port === 1 ? 'mqAnatServoS1' : 'mqAnatServoS2', port === 1 ? '#00d4ff' : '#4ade80', 400);
    },
    buzzer(durationMs) {
      const el = document.getElementById('mqAnatBuzzer');
      if (!el) return;
      el.style.filter = 'drop-shadow(0 0 8px #fbbf24)';
      clearTimeout(mqAnat._buzzT);
      mqAnat._buzzT = setTimeout(() => { el.style.filter = ''; }, durationMs);
    },
    neo(i, hex) {
      const el = document.getElementById('mqAnatNeo' + i);
      if (el) el.setAttribute('fill', hex);
    },
    motors(L, R) {
      const sL = document.getElementById('mqAnatSpokeL');
      const sR = document.getElementById('mqAnatSpokeR');
      function applySpoke(el, val) {
        if (!el) return;
        const mag = Math.abs(val) / 255;
        if (mag < 0.05) { el.style.opacity = '0'; el.style.animation = 'none'; return; }
        el.style.opacity = '0.95';
        // Faster duration → faster spin. 0.15 s = full speed.
        const dur = (1.0 - mag * 0.85).toFixed(2);
        const dir = val < 0 ? 'reverse' : 'normal';
        el.style.animation = `mqAnatWheelSpin ${dur}s linear infinite ${dir}`;
      }
      applySpoke(sL, L);
      applySpoke(sR, R);
    },
  };

  // -------- 🤖 LIVE MASCOT (Drive sub-tab) ----------------
  // The big top-down mascot becomes alive: it rotates with the robot's
  // estimated heading (from odometry), grows a sonar antenna that
  // tracks the S1 servo angle and shows the live distance reading,
  // and its eyes widen + glow red when the sonar sees an obstacle
  // closer than 10 cm. Three live data streams, one selfie of the bot.
  //
  // All best-effort: each call is a no-op if the SVG isn't on screen
  // (e.g. user is on a different sub-tab).
  const mqMascot = {
    // Apply odometry heading (radians, CW positive) to the spin group.
    // CSS transition smooths sub-frame jitter from the integrator.
    heading(theta) {
      const g = document.getElementById('mqMascotSpin');
      if (!g) return;
      const deg = (theta * 180 / Math.PI).toFixed(1);
      g.setAttribute('transform', `rotate(${deg} 140 110)`);
    },
    // Servo angle drives the sonar ray's rotation. Convention:
    //   servo 90° = pointing forward (no rotation)
    //   servo 0°  = pointed right of forward (+90° SVG rotation)
    //   servo 180°= pointed left  (−90° SVG rotation)
    sonarServo(angleDeg) {
      const g = document.getElementById('mqMascotSonarRay');
      if (!g) return;
      const rotateDeg = (90 - angleDeg).toFixed(1);
      g.setAttribute('transform', `translate(140 38) rotate(${rotateDeg})`);
    },
    // Distance reading sets ray length + color. Hide if no sensor / out-of-range.
    sonarDistance(cm) {
      const line = document.getElementById('mqMascotSonarLine');
      const tip  = document.getElementById('mqMascotSonarTip');
      if (!line || !tip) return;
      const valid = cm > 0 && cm < 500;
      if (!valid) {
        line.setAttribute('stroke-opacity', '0');
        tip.setAttribute('fill-opacity', '0');
        return;
      }
      // Map 0..100 cm → 8..50 px ray length (close = short, far = long).
      const len = 8 + Math.min(1, cm / 100) * 42;
      const y2 = -(3 + len);  // start at y=-3 (past sensor module rect)
      line.setAttribute('y2', y2.toFixed(1));
      tip.setAttribute('cy', y2.toFixed(1));
      // Color by distance (matches the eye-alert threshold).
      const color = cm < 10 ? '#f87171' : cm < 30 ? '#fbbf24' : '#4ade80';
      line.setAttribute('stroke', color);
      tip.setAttribute('fill', color);
      line.setAttribute('stroke-opacity', '0.85');
      tip.setAttribute('fill-opacity', '0.95');
      // Eye reaction — widen + red on near-obstacle.
      const close = cm < 10;
      const eyes = ['mqMascotEyeL', 'mqMascotEyeR'];
      eyes.forEach(id => {
        const e = document.getElementById(id);
        if (!e) return;
        e.setAttribute('stroke', close ? '#f87171' : '#4ade80');
        e.setAttribute('r', close ? '7' : '6');
        e.setAttribute('stroke-width', close ? '2' : '1.5');
        e.style.filter = close ? 'drop-shadow(0 0 5px #f87171)' : '';
      });
    },
  };

  // Drive STOP particle burst — 8 dust particles flying out, CSS-driven.
  function spawnStopPuff() {
    const mascot = document.getElementById('mqMascot');
    if (!mascot) return;
    const wrap = mascot.parentElement;
    if (!wrap) return;
    const puff = document.createElement('div');
    puff.className = 'mq-stop-puff';
    if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
    for (let i = 0; i < 8; i++) {
      const p = document.createElement('span');
      const a = (i / 8) * Math.PI * 2;
      const r = 32 + Math.random() * 18;
      p.style.setProperty('--dx', `calc(-50% + ${Math.cos(a) * r}px)`);
      p.style.setProperty('--dy', `calc(-50% + ${Math.sin(a) * r}px)`);
      puff.appendChild(p);
    }
    wrap.appendChild(puff);
    setTimeout(() => puff.remove(), 700);
  }
  function fireDrive(dataL, dataR, opts) {
    opts = opts || {};
    // Auto-cancel auto-wander if a non-wander caller (= the user) takes the
    // wheel. We DON'T issue a STOP here — the new fireDrive call IS the new
    // intended motion; cancel() just flips the flag and updates the button.
    try {
      if (typeof mqWander !== 'undefined' && mqWander.isActive() && !mqWander.isOurCall()) {
        mqWander.cancel();
      }
    } catch {}
    // Macro: same override semantic during PLAYBACK (recording is unaffected
    // — user input during recording IS the recording). Only cancels playback.
    try {
      if (typeof mqMacro !== 'undefined' && mqMacro.isPlaying() && !mqMacro.isOurCall()) {
        mqMacro.cancel();
      }
    } catch {}
    if (dataL === 0 && dataR === 0) {
      // STOP: don't coalesce — we want STOP to actually land.
      send('STOP');
      lastDir = null;
      _lastSentL = 0; _lastSentR = 0;
      setLastVerb('STOP');
      if (typeof updateMascot === 'function') updateMascot(0, 0);
      // Dust puff burst + stop the anatomy wheel-spin
      try { spawnStopPuff(); } catch {}
      try { mqAnat.motors(0, 0); } catch {}
      // Odometry — robot stopped, so wheel velocities are zero.
      try { mqOdometry.update(0, 0); } catch {}
      // Dashboard — power gauge falls to 0, gear flips to N.
      try { mqDashboard.recordMotors(0, 0); } catch {}
      // Macro — capture STOP frame too (motion ends are part of the dance).
      try { mqMacro.recordCmd(0, 0); } catch {}
      return;
    }
    const ref = 200;
    const L = Math.round(dataL * (speed / ref));
    const R = Math.round(dataR * (speed / ref));
    if (opts.coalesce && window.bleScheduler) {
      window.bleScheduler.send(`M:${L},${R}`, { coalesce: true }).catch(() => {});
    } else {
      send(`M:${L},${R}`);
    }
    lastDir = { l: dataL, r: dataR };
    _lastSentL = L; _lastSentR = R;
    setLastVerb(`M:${L},${R}`);
    if (typeof updateMascot === 'function') updateMascot(L, R);
    try { mqAnat.motors(L, R); } catch {}
    // Odometry — feed scaled wheel velocities so the trail integrates
    // what the ROBOT actually got (post speed-slider scaling), not the
    // raw button intent.
    try { mqOdometry.update(L, R); } catch {}
    // Dashboard — power needle, peak marker, gear (D/N/R), drive timer.
    try { mqDashboard.recordMotors(L, R); } catch {}
    // Macro — capture this frame (de-dups identical back-to-back values).
    try { mqMacro.recordCmd(L, R); } catch {}
  }
  // Stub overridden in initDriveJuice() once the SVG is on screen.
  let updateMascot = null;
  function initDrive() {
    const slider = document.getElementById('mqSpeedSlider');
    const readout = document.getElementById('mqSpeedReadout');
    if (!slider) return;
    // Odometry — start the integrator and wire its reset button.
    // It runs continuously (cheap when wheels are stopped — vL=vR=0
    // means the integral contributes nothing) so the trail persists
    // even when the user is idle.
    try { mqOdometry.start(); } catch {}
    const odoReset = document.getElementById('mqOdoReset');
    if (odoReset) odoReset.addEventListener('click', () => {
      try { mqOdometry.reset(); } catch {}
    });
    // 📸 Snapshot button — saves the path map + stats as PNG.
    const odoSnap = document.getElementById('mqOdoSnap');
    if (odoSnap) odoSnap.addEventListener('click', () => {
      odoSnap.disabled = true;
      try {
        mqSnapshot.takeSnapshot().catch(() => {}).finally(() => {
          odoSnap.disabled = false;
        });
      } catch {
        odoSnap.disabled = false;
      }
    });
    // Dashboard reset button — clears PEAK/AVG/TRIP/timer (NOT odo, NOT path)
    const dashReset = document.getElementById('mqDashReset');
    if (dashReset) dashReset.addEventListener('click', () => {
      try { mqDashboard.reset(); } catch {}
    });
    // Challenge selector — restore last pick + wire change handler
    const chalSel = document.getElementById('mqOdoChallenge');
    if (chalSel) {
      try { chalSel.value = mqChallenges.getName() || ''; } catch {}
      try { mqChallenges.paintBadge(); } catch {}
      chalSel.addEventListener('change', e => {
        try { mqChallenges.setShape(e.target.value); } catch {}
      });
    }
    // BLE link warning — react to connect/disconnect transitions.
    if (window.bleScheduler && window.bleScheduler.on) {
      const setLink = () => {
        try { mqDashboard.recordLink(window.bleScheduler.isConnected()); } catch {}
      };
      window.bleScheduler.on('connected',    setLink);
      window.bleScheduler.on('disconnected', () => {
        setLink();
        // SAFETY: kill ALL autonomous motor sources on disconnect.
        // Otherwise mqWander's setIntervals + mqMacro's playback queue
        // keep firing fireDrive() calls that pile up in the BLE
        // scheduler's queue. When the link comes back, all those
        // queued M:L,R commands flush at once → robot does erratic
        // moves the user didn't ask for.
        try { mqWander.stop(); } catch {}
        try { mqMacro.cancel(); } catch {}
        // Reset the on-screen mascot/dashboard so they don't keep
        // showing 'driving' state when nothing is actually moving.
        try { mqDashboard.recordMotors(0, 0); } catch {}
        try { mqAnat.motors(0, 0); } catch {}
        if (typeof updateMascot === 'function') updateMascot(0, 0);
      });
      // Initial paint
      setLink();
    }
    // Auto-wander toggle button.
    const wanderBtn = document.getElementById('mqDriveAutoWander');
    if (wanderBtn) {
      wanderBtn.addEventListener('click', () => {
        if (mqWander.isActive()) mqWander.stop();
        else                      mqWander.start();
      });
    }
    // Auto-wander obstacle-distance slider — restore from persisted
    // value, wire 'input' to live-set + persist + repaint readout.
    const obstSlider = document.getElementById('mqWanderObstacle');
    const obstRead   = document.getElementById('mqWanderObstacleRead');
    if (obstSlider) {
      try { obstSlider.value = mqWander.getObstacleCm(); } catch {}
      if (obstRead) obstRead.textContent = obstSlider.value + ' cm';
      obstSlider.addEventListener('input', e => {
        const v = +e.target.value;
        try { mqWander.setObstacleCm(v); } catch {}
        if (obstRead) obstRead.textContent = v + ' cm';
      });
    }
    // Macro record / replay buttons.
    const macroRec = document.getElementById('mqMacroRec');
    if (macroRec) macroRec.addEventListener('click', () => mqMacro.toggleRec());
    const macroPlay = document.getElementById('mqMacroPlay');
    if (macroPlay) macroPlay.addEventListener('click', () => mqMacro.togglePlay());
    slider.addEventListener('input', e => {
      speed = +e.target.value;
      readout.textContent = speed;
      // If a direction is currently active, re-send with new speed (coalesced)
      if (lastDir) {
        const ref = 200;
        const L = Math.round(lastDir.l * (speed / ref));
        const R = Math.round(lastDir.r * (speed / ref));
        if (window.bleScheduler) {
          window.bleScheduler.send(`M:${L},${R}`, { coalesce: true }).catch(() => {});
        }
        setLastVerb(`M:${L},${R}`);
      }
    });
    // Hold-to-drive option: when ON, press an arrow to drive and release
    // to STOP. When OFF (default), single-click sets the motors and they
    // keep running until STOP is pressed.
    let holdToDrive = false;
    try { holdToDrive = localStorage.getItem('maqueen.holdToDrive') === '1'; } catch {}
    const holdChk = document.getElementById('mqHoldToDrive');
    if (holdChk) {
      holdChk.checked = holdToDrive;
      holdChk.addEventListener('change', e => {
        holdToDrive = e.target.checked;
        try { localStorage.setItem('maqueen.holdToDrive', holdToDrive ? '1' : '0'); } catch {}
        // Brake immediately when toggling so a held button doesn't keep running
        fireDrive(0, 0);
      });
    }

    document.querySelectorAll('.mq-drive-btn').forEach(btn => {
      const isStopBtn = btn.dataset.stop === '1';
      // STOP always works the same — single click brakes
      if (isStopBtn) {
        btn.addEventListener('click', () => fireDrive(0, 0));
        return;
      }
      const dl = +btn.dataset.l;
      const dr = +btn.dataset.r;
      // Click mode (default)
      btn.addEventListener('click', () => {
        if (holdToDrive) return;   // press/release path handles it
        fireDrive(dl, dr);
      });
      // Hold-to-drive mode: press → drive, release → stop.
      // Use mousedown/touchstart paired with up/leave/end/cancel for
      // robust release detection on both mouse and touch.
      const press = (e) => {
        if (!holdToDrive) return;
        e.preventDefault();
        fireDrive(dl, dr);
      };
      const release = (e) => {
        if (!holdToDrive) return;
        e.preventDefault();
        fireDrive(0, 0);
      };
      btn.addEventListener('mousedown',  press);
      btn.addEventListener('touchstart', press, { passive: false });
      btn.addEventListener('mouseup',    release);
      btn.addEventListener('mouseleave', release);
      btn.addEventListener('touchend',   release);
      btn.addEventListener('touchcancel',release);
    });

    initDriveJuice();
  }

  // -------- DRIVE JUICE: mascot wheels + joystick + keyboard ----
  // All three input paths funnel through fireDrive() — the BLE layer
  // doesn't see a difference between buttons / joystick / keyboard.
  function initDriveJuice() {
    // ---- WHEEL ANIMATION ----
    // Each wheel rotates around its own center (the inner <g> uses no
    // translate, only transform=rotate, so it spins in place inside the
    // already-translated parent group). Speed is proportional to the
    // signed motor value last sent.
    const wheelL = document.getElementById('mqWheelL');
    const wheelR = document.getElementById('mqWheelR');
    const flames = document.getElementById('mqMascotFlames');
    const mouth  = document.getElementById('mqMascotMouth');
    let wlAngle = 0, wrAngle = 0;
    function tick() {
      // Degrees per frame at full motor (255) — calibrated for visible-but-
      // not-blurry spin at ~60 fps. Negative motor = reverse.
      const degPerFrame = 7;
      wlAngle = (wlAngle + (_lastSentL / 255) * degPerFrame) % 360;
      wrAngle = (wrAngle + (_lastSentR / 255) * degPerFrame) % 360;
      if (wheelL) wheelL.setAttribute('transform', `rotate(${wlAngle.toFixed(1)})`);
      if (wheelR) wheelR.setAttribute('transform', `rotate(${wrAngle.toFixed(1)})`);
      requestAnimationFrame(tick);
    }
    if (wheelL || wheelR) requestAnimationFrame(tick);

    // ---- MASCOT REACTIONS (face / flames / power bars / motion vector) ----
    const powerLBar = document.getElementById('mqPowerLBar');
    const powerRBar = document.getElementById('mqPowerRBar');
    const powerLVal = document.getElementById('mqPowerLVal');
    const powerRVal = document.getElementById('mqPowerRVal');
    const motionVec = document.getElementById('mqMotionVec');

    function setPowerBar(barEl, valEl, val) {
      if (!barEl) return;
      // Bar fills from baseline (y=0) upward for positive, downward for negative.
      // Bar has total height 100, baseline at y=0, range -50..+50 in svg units.
      const h = Math.round(Math.abs(val) / 255 * 50);
      if (val >= 0) {
        barEl.setAttribute('y', String(-h));
        barEl.setAttribute('height', String(h));
      } else {
        barEl.setAttribute('y', '0');
        barEl.setAttribute('height', String(h));
      }
      if (valEl) valEl.textContent = String(val);
    }

    updateMascot = function (L, R) {
      // flames when both wheels going forward fast
      if (flames) flames.style.opacity = (L > 100 && R > 100) ? '1' : '0';
      // mouth: smile while moving, neutral on stop
      if (mouth) {
        if (L === 0 && R === 0) {
          mouth.setAttribute('rx', '14'); mouth.setAttribute('ry', '2');
        } else {
          mouth.setAttribute('rx', '14'); mouth.setAttribute('ry', '6');
        }
      }
      // Power bars
      setPowerBar(powerLBar, powerLVal, L);
      setPowerBar(powerRBar, powerRVal, R);
      // Motion vector — direction from differential drive intuition.
      // Forward speed = avg of L,R. Turn = (R-L)/2 → maps to rotation angle.
      // Vector length = magnitude (clamped 0..1). Vector rotation = atan2-ish.
      if (motionVec) {
        const fwd = (L + R) / 2;          // forward component
        const turn = (R - L) / 2;         // turn component
        const mag = Math.min(1, Math.sqrt(fwd*fwd + turn*turn) / 200);
        // Angle: 0deg = up (forward). Negative turn → rotate left (CCW).
        // Use atan2(turn, abs(fwd)) so reverse still points "down".
        let angleDeg = 0;
        if (Math.abs(fwd) > 1 || Math.abs(turn) > 1) {
          const a = Math.atan2(turn, fwd) * 180 / Math.PI;
          angleDeg = a;
          if (fwd < 0) angleDeg = 180 - a;   // reverse → flip
        }
        motionVec.setAttribute(
          'transform',
          `translate(140 110) rotate(${angleDeg.toFixed(1)}) scale(${mag.toFixed(2)})`
        );
      }
      // BLE tape entry
      pushBleTape(L, R);
    };

    // ---- LIVE BLE VERB TAPE ----
    // Dedup consecutive identical verbs (joystick drag would otherwise spam)
    // and remove the static "last cmd: —" row on first push.
    const tape = document.getElementById('mqBleTape');
    let lastTapeVerb = '';
    function pushBleTape(L, R) {
      if (!tape) return;
      const verb = (L === 0 && R === 0) ? 'STOP' : `M:${L},${R}`;
      if (verb === lastTapeVerb) return;
      lastTapeVerb = verb;
      // First real entry — clear the "last cmd: —" placeholder.
      const placeholder = document.getElementById('mqDriveLast');
      if (placeholder) placeholder.remove();
      const t = new Date();
      const time = t.toTimeString().slice(0,8);
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; gap:8px; padding:1px 0; opacity:0;';
      row.innerHTML =
        `<span style="color:#4ade80; min-width:62px;">${time}</span>` +
        `<span style="color:#93a8c4;">→</span>` +
        `<span style="color:#fb923c; font-weight:700;">${verb}</span>` +
        `<span style="margin-left:auto; color:#93a8c4; font-size:10px;" data-pending>…</span>`;
      tape.insertBefore(row, tape.firstChild);
      requestAnimationFrame(() => { row.style.transition = 'opacity 0.2s'; row.style.opacity = '1'; });
      while (tape.children.length > 6) tape.removeChild(tape.lastChild);
    }

    // Subscribe to scheduler echo events to mark the most-recent pending row
    // as "✓ <latency>". The echo event has { seq, verb, latency }.
    if (window.bleScheduler && window.bleScheduler.on) {
      window.bleScheduler.on('echo', (info) => {
        if (!tape || !info) return;
        // Only mark M:* / STOP echoes (other verbs aren't drive)
        const v = info.verb || '';
        if (!v.startsWith('M:') && v !== 'STOP') return;
        const pending = tape.querySelector('[data-pending]');
        if (pending) {
          const ms = Math.round(info.latency || 0);
          pending.textContent = `✓ ${ms} ms`;
          pending.style.color = ms < 100 ? '#4ade80' : ms < 300 ? '#fbbf24' : '#f87171';
          pending.removeAttribute('data-pending');
        }
      });
    }

    // ---- JOYSTICK ----
    // Maps drag position to differential drive. Y axis = forward (up
    // is positive forward), X axis = turn right (positive). Send while
    // dragging in coalesce mode so the BLE channel can't drown.
    const zone  = document.getElementById('mqJoyZone');
    const thumb = document.getElementById('mqJoyThumb');
    if (zone && thumb) {
      const radius = 50;     // thumb travel radius in px (zone is 140 / 2 minus thumb radius)
      let dragging = false;
      let cx = 0, cy = 0;
      function start(e) {
        e.preventDefault();
        dragging = true;
        thumb.style.transition = 'none';
        const r = zone.getBoundingClientRect();
        cx = r.left + r.width / 2;
        cy = r.top  + r.height / 2;
        move(e);
      }
      function move(e) {
        if (!dragging) return;
        e.preventDefault();
        const t = (e.touches && e.touches[0]) || e;
        let dx = t.clientX - cx;
        let dy = t.clientY - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > radius) { dx *= radius / d; dy *= radius / d; }
        thumb.style.transform = `translate(${dx}px, ${dy}px)`;
        // Normalize -1..1 (y inverted: drag UP = forward)
        const nx = dx / radius;
        const ny = -dy / radius;
        // Differential drive mix
        const ref = 200;          // matches fireDrive scale
        const L = Math.max(-200, Math.min(200, Math.round((ny + nx) * ref)));
        const R = Math.max(-200, Math.min(200, Math.round((ny - nx) * ref)));
        // Below dead-zone: treat as stop so it actually brakes when near center
        if (Math.abs(nx) < 0.12 && Math.abs(ny) < 0.12) {
          fireDrive(0, 0);
        } else {
          fireDrive(L, R, { coalesce: true });
        }
      }
      function end(e) {
        if (!dragging) return;
        e && e.preventDefault();
        dragging = false;
        thumb.style.transition = 'transform 0.15s ease-out';
        thumb.style.transform = 'translate(0px, 0px)';
        fireDrive(0, 0);
      }
      zone.addEventListener('pointerdown', start);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    }

    // ---- KEYBOARD ----
    // WASD / arrow keys / Space — only active when the Drive sub-tab is
    // visible AND no input field is focused. Latest direction wins;
    // releasing the active key sends STOP.
    const KEY = {
      'w':       [200, 200],  'arrowup':    [200, 200],
      's':       [-200, -200], 'arrowdown':  [-200, -200],
      'a':       [-150, 150],  'arrowleft':  [-150, 150],
      'd':       [150, -150],  'arrowright': [150, -150],
    };
    const held = new Set();
    function driveSubtabActive() {
      const maqActive = document.querySelector('.tab-btn.active');
      if (!maqActive || maqActive.getAttribute('data-page') !== 'maqueen') return false;
      const sub = document.querySelector('.mq-sub-page.mq-sub-active');
      return sub && sub.getAttribute('data-mq-sub') === 'drive';
    }
    function isTyping() {
      const a = document.activeElement;
      if (!a) return false;
      const t = a.tagName;
      return t === 'INPUT' || t === 'TEXTAREA' || a.isContentEditable;
    }
    // Visual echo: when a key fires, briefly highlight the matching keypad
    // button so keyboard users see WHICH on-screen button they triggered —
    // makes the equivalence between keyboard / tap / drag obvious.
    // Arrow keys map onto the same WASD buttons (no separate buttons exist).
    const KEYPAD_ECHO_MAP = {
      'w': 'w', 'arrowup': 'w',
      's': 's', 'arrowdown': 's',
      'a': 'a', 'arrowleft': 'a',
      'd': 'd', 'arrowright': 'd',
      ' ': ' ',
    };
    function flashKeypad(k) {
      const dataKey = KEYPAD_ECHO_MAP[k];
      if (!dataKey) return;
      const btn = document.querySelector(`.mq-keypad-btn[data-key="${dataKey === ' ' ? ' ' : dataKey}"]`);
      if (!btn) return;
      btn.classList.add('mq-keypad-flash');
    }
    function unflashKeypad(k) {
      const dataKey = KEYPAD_ECHO_MAP[k];
      if (!dataKey) return;
      const btn = document.querySelector(`.mq-keypad-btn[data-key="${dataKey === ' ' ? ' ' : dataKey}"]`);
      if (!btn) return;
      btn.classList.remove('mq-keypad-flash');
    }
    document.addEventListener('keydown', (e) => {
      if (!driveSubtabActive() || isTyping()) return;
      const k = e.key.toLowerCase();
      if (k === ' ') {
        e.preventDefault();
        held.clear();
        fireDrive(0, 0);
        flashKeypad(' ');
        // Space is a tap-style action — auto-clear flash after 150 ms.
        setTimeout(() => unflashKeypad(' '), 150);
        return;
      }
      const v = KEY[k];
      if (!v) return;
      e.preventDefault();
      if (held.has(k)) return;   // ignore key auto-repeat
      held.add(k);
      flashKeypad(k);
      fireDrive(v[0], v[1], { coalesce: true });
    });
    document.addEventListener('keyup', (e) => {
      if (!driveSubtabActive()) return;
      const k = e.key.toLowerCase();
      if (!KEY[k]) return;
      held.delete(k);
      unflashKeypad(k);
      // No more direction keys held → stop. (If user is still holding
      // another, fire that one instead.)
      if (held.size === 0) {
        fireDrive(0, 0);
      } else {
        const next = held.values().next().value;
        const v = KEY[next];
        fireDrive(v[0], v[1], { coalesce: true });
      }
    });
  }

  // -------- SERVOS + KIT PICKER ---------------------------
  // Per-kit servo metadata: labels for S1/S2 and 4 quick presets.
  const KITS = {
    base: {
      name: 'generic',
      s1Label: 'S1', s2Label: 'S2',
      presets: [
        { label: '0°', s1: 0,   s2: 0   },
        { label: '90°',s1: 90,  s2: 90  },
        { label: '180°', s1: 180, s2: 180 },
      ],
    },
    forklift: {
      name: 'Forklift',
      s1Label: 'Lift', s2Label: 'Tilt',
      presets: [
        { label: '⬇ Down',   s1: 30,  s2: 90 },
        { label: '🚚 Carry', s1: 110, s2: 75 },
        { label: '⬆ Lift',   s1: 170, s2: 90 },
      ],
    },
    loader: {
      name: 'Loader',
      s1Label: 'Arm', s2Label: 'Bucket',
      presets: [
        { label: '⛏ Scoop',  s1: 30,  s2: 30  },
        { label: '🚛 Carry', s1: 100, s2: 60  },
        { label: '🪣 Dump',  s1: 150, s2: 170 },
      ],
    },
    beetle: {
      name: 'Beetle gripper',
      s1Label: 'Arm', s2Label: 'Grip',
      presets: [
        { label: '🤲 Open',  s1: 90,  s2: 30  },
        { label: '✊ Close', s1: 90,  s2: 150 },
        { label: '⬆ Lift',  s1: 150, s2: 150 },
      ],
    },
    push: {
      name: 'Push / bulldozer',
      s1Label: 'Blade', s2Label: '—',
      presets: [
        { label: '⬇ Down', s1: 30,  s2: 90 },
        { label: '↔ Mid',  s1: 90,  s2: 90 },
        { label: '⬆ Up',   s1: 160, s2: 90 },
      ],
    },
  };

  let currentKit = 'base';

  // Mechanic-kit attachments overlaid on the anatomy mini-map. Each kit
  // is a tiny SVG snippet drawn at the front of the chassis, with a
  // gentle CSS animation so the attachment LOOKS ALIVE (forks lift,
  // bucket scoops, gripper pinches, blade pushes).
  const KIT_OVERLAYS = {
    base: '',
    forklift:
      '<g style="transform-origin:110px 124px; animation: mqKitLift 3s ease-in-out infinite;">' +
        '<rect x="105" y="100" width="10" height="22" fill="#facc15" stroke="#92400e" stroke-width="0.6"/>' +
        '<rect x="92"  y="118" width="14" height="3" fill="#facc15" stroke="#92400e" stroke-width="0.4"/>' +
        '<rect x="114" y="118" width="14" height="3" fill="#facc15" stroke="#92400e" stroke-width="0.4"/>' +
      '</g>',
    loader:
      '<g style="transform-origin:110px 100px; animation: mqKitScoop 3s ease-in-out infinite;">' +
        '<path d="M 110 100 L 100 116 L 92 124" fill="none" stroke="#facc15" stroke-width="2.5" stroke-linecap="round"/>' +
        '<path d="M 86 122 L 100 122 L 96 130 L 90 130 Z" fill="#facc15" stroke="#92400e" stroke-width="0.5"/>' +
      '</g>',
    beetle:
      '<g style="transform-origin:110px 100px; animation: mqKitPinch 2.4s ease-in-out infinite;">' +
        '<line x1="110" y1="100" x2="92" y2="125" stroke="#22c55e" stroke-width="2" stroke-linecap="round"/>' +
        '<line x1="110" y1="100" x2="128" y2="125" stroke="#22c55e" stroke-width="2" stroke-linecap="round"/>' +
        '<circle cx="92"  cy="125" r="2.5" fill="#16a34a"/>' +
        '<circle cx="128" cy="125" r="2.5" fill="#16a34a"/>' +
      '</g>',
    push:
      '<g style="transform-origin:110px 120px; animation: mqKitPush 2.6s ease-in-out infinite;">' +
        '<rect x="80" y="116" width="60" height="8" rx="1" fill="#94a3b8" stroke="#475569" stroke-width="0.6"/>' +
        '<rect x="86" y="108" width="3" height="10" fill="#475569"/>' +
        '<rect x="131" y="108" width="3" height="10" fill="#475569"/>' +
      '</g>',
  };
  function updateAnatomyKit(kitKey) {
    const g = document.getElementById('mqAnatomyKit');
    if (g) g.innerHTML = KIT_OVERLAYS[kitKey] || '';
  }

  // (Mini-robot preview removed — was duplicate of the rail anatomy
  // SVG which already shows kit attachments via #mqAnatomyKit overlay.)

  function applyKit(kitKey) {
    const kit = KITS[kitKey] || KITS.base;
    currentKit = kitKey;
    updateAnatomyKit(kitKey);
    document.getElementById('mqServosKitName').textContent = `(${kit.name})`;
    document.getElementById('mqS1Label').textContent = kit.s1Label;
    document.getElementById('mqS2Label').textContent = kit.s2Label;
    const presetEl = document.getElementById('mqServoPresets');
    presetEl.innerHTML = '';
    // Cleanup: for the Base (generic) kit, the 3 default presets
    // (0°/90°/180° on both servos) are pure duplication of the
    // per-servo quick-buttons inside each S1/S2 card. Hide the
    // whole row in that case to remove the visual overlap.
    if (kitKey === 'base') {
      presetEl.style.display = 'none';
      return;
    }
    presetEl.style.display = 'flex';
    kit.presets.forEach(p => {
      const b = document.createElement('button');
      b.textContent = p.label;
      b.style.cssText = 'flex:1; min-width:80px; padding:8px 6px; background:#0a1628; color:#00d4ff; border:1px solid #00d4ff; border-radius:6px; cursor:pointer; font-size:11px;';
      b.addEventListener('click', () => {
        // Route through the slider 'input' event so initServos's setAngle
        // path runs — dials, big readouts, code preview, echo status all
        // update consistently. (Direct send() bypassed the visual chain.)
        const s1El = document.getElementById('mqS1Slider');
        const s2El = document.getElementById('mqS2Slider');
        if (s1El) { s1El.value = p.s1; s1El.dispatchEvent(new Event('input', { bubbles: true })); }
        if (s2El) { s2El.value = p.s2; s2El.dispatchEvent(new Event('input', { bubbles: true })); }
      });
      presetEl.appendChild(b);
    });
    try { localStorage.setItem('maqueen.kit', kitKey); } catch {}
  }

  function initServos() {
    const s1 = document.getElementById('mqS1Slider');
    const s2 = document.getElementById('mqS2Slider');
    if (!s1) return;
    const r1     = document.getElementById('mqS1Readout');
    const r2     = document.getElementById('mqS2Readout');
    const big1   = document.getElementById('mqS1BigReadout');
    const big2   = document.getElementById('mqS2BigReadout');
    const dial1  = document.getElementById('mqServoDialS1');
    const dial2  = document.getElementById('mqServoDialS2');
    const codeView   = document.getElementById('mqServoCodeView');
    const codeStatus = document.getElementById('mqServoCodeStatus');
    let codeTab = 'lib';                 // 'lib' or 'raw'
    let lastShown = { port: 1, angle: 90 };

    // Inspired by the Servo Explorer pilot: rotate horn, show live code,
    // confirm with echo latency. All sends already go through the
    // scheduler in coalesce mode — BLE behavior unchanged.
    function rotateDial(port, angle) {
      const d = port === 1 ? dial1 : dial2;
      if (d) d.setAttribute('transform', `rotate(${angle - 90} 100 100)`);
    }
    function setBigReadout(port, angle) {
      const el = port === 1 ? big1 : big2;
      if (el) el.textContent = angle + '°';
    }
    function renderCode() {
      if (!codeView) return;
      const a = lastShown.angle;
      const port = lastShown.port;
      const hi = (s) => `<span style="color:#facc15; background:#fbbf2433; padding:0 4px; border-radius:3px;">${s}</span>`;
      if (codeTab === 'lib') {
        codeView.innerHTML =
          `maqueen.servoRun(maqueen.Servos.S${port}, ${hi(a)})`;
      } else {
        // raw I²C: motor driver register 0x14 = S1, 0x15 = S2; addr 0x10
        const reg = port === 1 ? '0x14' : '0x15';
        codeView.innerHTML =
          `let buf = pins.createBuffer(2)\n` +
          `buf[0] = ${reg}      // ${port === 1 ? 'S1' : 'S2'} register\n` +
          `buf[1] = ${hi(a)}\n` +
          `pins.i2cWriteBuffer(0x10, buf)`;
      }
    }
    function flashStatus(text, color) {
      if (!codeStatus) return;
      codeStatus.textContent = text;
      codeStatus.style.color = color || '#93a8c4';
    }

    // PWM scope: 600 px viewBox = 60 ms = THREE 20-ms periods (so the
    // repetition is visible). Pulse width 1.0..2.0 ms maps to 10..20 px
    // within each 200 px period.
    function updateServoScope(angle) {
      const trace = document.getElementById('mqServoScopeTrace');
      const anno  = document.getElementById('mqServoScopePwAnno');
      const lbl   = document.getElementById('mqServoScopePwLabel');
      const info  = document.getElementById('mqServoScopeInfo');
      if (!trace) return;
      const pwMs    = 1.0 + (angle / 180);     // 1.0 .. 2.0 ms
      const periodPx = 200;                    // 20 ms per period
      const pwPx    = (pwMs / 20) * periodPx;  // pulse width in px
      // 3 periods, each 200 px wide. Build a single path that pulses up at
      // the start of every period.
      let d = 'M 0 60';
      for (let p = 0; p < 3; p++) {
        const x0 = p * periodPx;
        const x1 = x0 + pwPx;
        const xEnd = (p + 1) * periodPx;
        d += ` L ${x0} 60 L ${x0} 14 L ${x1.toFixed(1)} 14 L ${x1.toFixed(1)} 60 L ${xEnd} 60`;
      }
      trace.setAttribute('d', d);
      if (anno) {
        // Annotate the FIRST period's pulse-width
        anno.setAttribute('x1', '0');
        anno.setAttribute('x2', pwPx.toFixed(1));
      }
      if (lbl) {
        lbl.setAttribute('x', (pwPx / 2).toFixed(1));
        lbl.textContent = pwMs.toFixed(2) + ' ms';
      }
      if (info) info.textContent = pwMs.toFixed(2) + ' ms HIGH every 20 ms';
      // Mirror the summary inside the collapsed <details> so kids see
      // it update even when the full scope is folded.
      const infoSum = document.getElementById('mqServoScopeInfoSummary');
      if (infoSum) infoSum.textContent = pwMs.toFixed(2) + ' ms HIGH every 20 ms';
    }

    function setAngle(port, angle, opts) {
      angle = Math.max(0, Math.min(180, +angle));
      lastShown = { port, angle };
      // visual
      rotateDial(port, angle);
      setBigReadout(port, angle);
      const slider = port === 1 ? s1 : s2;
      const readout = port === 1 ? r1 : r2;
      if (slider && +slider.value !== angle) slider.value = angle;
      if (readout) readout.textContent = angle + '°';
      updateServoScope(angle);
      renderCode();
      try { mqAnat.servo(port); } catch {}
      // Sweep radar AND odometry SLAM-lite both track S1 only (that's the
      // port the sonar is mounted on in the Maqueen kit). The big mascot
      // also gets it (the on-screen sonar antenna pivots with S1).
      try { if (port === 1) mqSweepRadar.recordAngle(angle); } catch {}
      try { if (port === 1) mqOdometry.recordAngle(angle); } catch {}
      try { if (port === 1) mqMascot.sonarServo(angle); } catch {}
      // BLE — coalesced so dragging the slider doesn't drown the channel
      if (window.bleScheduler) {
        flashStatus('… sending', '#fbbf24');
        window.bleScheduler.send(`SRV:${port},${angle}`, { coalesce: true })
          .then(({ latency } = {}) => {
            flashStatus(`✓ ${Math.round(latency || 0)} ms`, '#4ade80');
          })
          .catch(err => {
            flashStatus(`✗ ${err && err.message || 'err'}`, '#f87171');
          });
      }
    }

    // Slider + quick-button wiring lives below in the mode-aware block —
    // s1/s2 dispatch via modeAwareSlider() depending on 180° vs 360° mode.

    // Shared sweep-speed control — period in ms (full back-and-forth cycle)
    let sweepPeriodMs = 2000;
    try { sweepPeriodMs = +localStorage.getItem('maqueen.sweepPeriod') || 2000; } catch {}
    const sweepSlider  = document.getElementById('mqServoSweepSpeed');
    const sweepReadout = document.getElementById('mqServoSweepSpeedRead');
    function paintSweepReadout() {
      if (sweepReadout) sweepReadout.textContent = (sweepPeriodMs / 1000).toFixed(1) + ' s/cycle';
    }
    if (sweepSlider) {
      sweepSlider.value = sweepPeriodMs;
      paintSweepReadout();
      sweepSlider.addEventListener('input', e => {
        sweepPeriodMs = +e.target.value;
        try { localStorage.setItem('maqueen.sweepPeriod', String(sweepPeriodMs)); } catch {}
        paintSweepReadout();
      });
    }
    // Shared sweep-RANGE control — start/end angles for the sweep.
    // Default 0..180 (full range). User can narrow to e.g. 60..120 to
    // sweep only the front cone, or 0..90 for left half. Persisted.
    let sweepFromDeg = 0;
    let sweepToDeg   = 180;
    try {
      const f = +localStorage.getItem('maqueen.sweepFrom');
      const t = +localStorage.getItem('maqueen.sweepTo');
      if (f >= 0 && f <= 180) sweepFromDeg = f;
      if (t >= 0 && t <= 180) sweepToDeg = t;
    } catch {}
    function clampSweepRange() {
      sweepFromDeg = Math.max(0, Math.min(180, sweepFromDeg));
      sweepToDeg   = Math.max(0, Math.min(180, sweepToDeg));
      // Allow from > to (reversed sweep direction). User intent preserved.
    }
    const sweepFromInput = document.getElementById('mqServoSweepFrom');
    const sweepToInput   = document.getElementById('mqServoSweepTo');
    const sweepFromRead   = document.getElementById('mqServoSweepFromRead');
    const sweepToRead     = document.getElementById('mqServoSweepToRead');
    // Inline readouts that live next to each slider when the
    // fine-tune disclosure is expanded (so kids see live values
    // while dragging instead of having to glance up at the summary).
    const sweepFromInline = document.getElementById('mqServoSweepFromInline');
    const sweepToInline   = document.getElementById('mqServoSweepToInline');
    function paintSweepRangeReadouts() {
      if (sweepFromRead)   sweepFromRead.textContent   = sweepFromDeg + '°';
      if (sweepToRead)     sweepToRead.textContent     = sweepToDeg + '°';
      if (sweepFromInline) sweepFromInline.textContent = sweepFromDeg + '°';
      if (sweepToInline)   sweepToInline.textContent   = sweepToDeg + '°';
      // Highlight any preset that exactly matches the current range.
      document.querySelectorAll('.mq-sweep-preset').forEach(b => {
        const f = +b.dataset.from, t = +b.dataset.to;
        b.classList.toggle('mq-sweep-preset-active',
          f === sweepFromDeg && t === sweepToDeg);
      });
    }
    if (sweepFromInput) {
      sweepFromInput.value = sweepFromDeg;
      sweepFromInput.addEventListener('input', e => {
        sweepFromDeg = +e.target.value || 0;
        clampSweepRange();
        try { localStorage.setItem('maqueen.sweepFrom', String(sweepFromDeg)); } catch {}
        paintSweepRangeReadouts();
      });
    }
    if (sweepToInput) {
      sweepToInput.value = sweepToDeg;
      sweepToInput.addEventListener('input', e => {
        sweepToDeg = +e.target.value || 180;
        clampSweepRange();
        try { localStorage.setItem('maqueen.sweepTo', String(sweepToDeg)); } catch {}
        paintSweepRangeReadouts();
      });
    }
    // Preset chips — one tap sets BOTH sliders + persists + repaints.
    // The matching preset (if any) gets highlighted via .mq-sweep-preset-active.
    document.querySelectorAll('.mq-sweep-preset').forEach(b => {
      b.addEventListener('click', () => {
        sweepFromDeg = +b.dataset.from;
        sweepToDeg   = +b.dataset.to;
        clampSweepRange();
        if (sweepFromInput) sweepFromInput.value = sweepFromDeg;
        if (sweepToInput)   sweepToInput.value   = sweepToDeg;
        try {
          localStorage.setItem('maqueen.sweepFrom', String(sweepFromDeg));
          localStorage.setItem('maqueen.sweepTo',   String(sweepToDeg));
        } catch {}
        paintSweepRangeReadouts();
      });
    });
    // Initial paint (matches whatever was loaded from localStorage).
    paintSweepRangeReadouts();

    // Sweep — uses scheduler.animate so it's properly rate-limited.
    // Reads sweepPeriodMs LIVE on each tick so the slider can adjust speed
    // mid-sweep without restarting. Update rate scales inversely too —
    // faster sweep → more frames per second so motion stays smooth.
    //
    // Motion profile: NOT a sine wave. We use a triangle "progress" through
    // each half-cycle, fed through a quintic smoothstep (6t⁵ − 15t⁴ + 10t³).
    // The quintic has TWO zero-derivatives at the endpoints (velocity AND
    // acceleration), so the reversal feels gentle — the SG90 doesn't get
    // "slammed" at 0° / 180°, the radar beam doesn't whip around. Plus a
    // configurable dwell at each endpoint so the servo gets a beat to settle
    // before reversing — same trick real survey radars use ("look around"
    // pause). Compare to the old code:
    //   old: const a = 90 + 90 * sin(phase)    // sin has zero v but max a at endpoints
    //   new: smooth(triangle(t)) * 180         // both v and a are zero at endpoints
    const sweeping = { 1: false, 2: false };
    const SWEEP_DWELL_FRAC = 0.08;          // 8% of cycle held at each endpoint
    function sweepAngle(cycleT) {
      // cycleT ∈ [0, 1) — one full back-and-forth.
      // Layout:  [dwell-low]  ↗ rise ↗  [dwell-high]  ↘ fall ↘
      //          [0,    D]   [D, 0.5-D]  [0.5-D, 0.5+D] [0.5+D, 1-D] [1-D, 1)
      // Endpoints are sweepFromDeg → sweepToDeg (live values, so the user
      // can re-tune the range mid-sweep). Quintic smoothstep on the
      // [0..1] progress, then linearly remapped to [from..to].
      const D = SWEEP_DWELL_FRAC;
      const from = sweepFromDeg, to = sweepToDeg;
      if (cycleT < D) return from;                            // dwell at 'from'
      if (cycleT < 0.5 - D) {
        const u = (cycleT - D) / (0.5 - 2 * D);               // 0..1
        const e = u * u * u * (u * (u * 6 - 15) + 10);        // quintic smoothstep
        return from + (to - from) * e;
      }
      if (cycleT < 0.5 + D) return to;                        // dwell at 'to'
      if (cycleT < 1 - D) {
        const u = (cycleT - (0.5 + D)) / (0.5 - 2 * D);
        const e = u * u * u * (u * (u * 6 - 15) + 10);
        return to - (to - from) * e;
      }
      return from;                                            // dwell at 'from' (wraps)
    }
    // Helpers exposed so setMode() can stop a sweep BEFORE it tears down
    // the quick-buttons innerHTML — otherwise the BLE animate keeps firing
    // on a stale id while the user's click on the new (re-rendered) button
    // does nothing because the old per-button listener is gone with the DOM.
    // Visual update — used by BOTH the local-mode animation tick AND
    // the firmware-mode SWP: push handler. Single source of truth so
    // dial/slider/readout/radar/mascot/scope/code all stay in sync.
    function applyVisualAngle(port, a) {
      rotateDial(port, a);
      setBigReadout(port, a);
      const slider = port === 1 ? s1 : s2;
      const readout = port === 1 ? r1 : r2;
      if (slider) slider.value = a;
      if (readout) readout.textContent = a + '°';
      lastShown = { port, angle: a };
      updateServoScope(a);
      renderCode();
      try { if (port === 1) mqSweepRadar.recordAngle(a); } catch {}
      try { if (port === 1) mqOdometry.recordAngle(a); } catch {}
      try { if (port === 1) mqMascot.sonarServo(a); } catch {}
    }

    function startSweep(port) {
      if (!window.bleScheduler) return;
      if (sweeping[port]) return;
      sweeping[port] = true;
      // === DISPATCH: firmware-side SWEEP: vs browser-side animation ===
      // mqSweepMode owns the policy: 'auto' (default) picks firmware
      // when the FW? capability list contains 'sweep', else falls back
      // to browser. 'browser' / 'firmware' are user overrides.
      const useFirmware = window.mqSweepMode && window.mqSweepMode.shouldUseFirmware();
      if (useFirmware) {
        // ONE COMMAND: micro:bit drives the servo at 50 Hz locally and
        // pushes SWP:port,angle back at 20 Hz so visuals follow truth.
        // ease=1 is smoothstep; the firmware's curve matches our local
        // sweepAngle() so the kid sees identical motion across modes.
        try {
          window.bleScheduler.send(
            `SWEEP:${port},${sweepFromDeg},${sweepToDeg},${sweepPeriodMs},1`
          ).catch(() => {});
        } catch {}
        paintSweepButton(port);
        return;
      }
      // ===== BROWSER MODE — local animation =====
      // Visual ticks fire at 30 Hz so the on-screen dial / readout /
      // radar update smoothly. BUT we only emit SRV: every ~85 ms
      // (≈12 Hz), matching the BLE SRV rate cap and the SG90 servo's
      // ~100 ms physical slew time. Sending faster than the servo can
      // mechanically reach the target causes its internal PID to
      // overshoot, then reverse — visible as 'small back, forward'.
      const VISUAL_HZ = 30;
      const SEND_INTERVAL_MS = 85;
      let lastSent = null;
      let lastSendT = 0;
      window.bleScheduler.animate(`servo-sweep-${port}`, t => {
        // Read sweepPeriodMs LIVE so slider adjusts speed mid-sweep.
        const cycleT = (t % sweepPeriodMs) / sweepPeriodMs;
        const a = Math.round(sweepAngle(cycleT));
        applyVisualAngle(port, a);
        // === BLE SEND GATE ===
        if (a === lastSent) return null;
        if ((t - lastSendT) < SEND_INTERVAL_MS) return null;
        lastSent = a;
        lastSendT = t;
        return `SRV:${port},${a}`;
      }, VISUAL_HZ);
      paintSweepButton(port);
    }
    function stopSweep(port) {
      const wasFirmware = sweeping[port] === 'firmware';
      sweeping[port] = false;
      // Browser-mode: stop the local animation loop.
      if (window.bleScheduler) window.bleScheduler.stop(`servo-sweep-${port}`);
      // Firmware-mode: tell the micro:bit to stop its own sweep loop.
      // Always send (defensive — even if we think we were in browser mode,
      // the firmware might still be running a stale sweep from a previous
      // session). Cheap idempotent verb.
      try {
        if (window.bleScheduler) {
          window.bleScheduler.send(`SWEEP:${port},STOP`, { coalesce: true }).catch(() => {});
        }
      } catch {}
      paintSweepButton(port);
    }

    // Subscribe to SWP:port,angle pushes from firmware-mode sweep so the
    // browser visuals (slider/dial/radar/mascot) follow the robot's truth.
    // No-op if the firmware isn't pushing (browser mode never emits SWP).
    if (window.mqSweepMode && window.mqSweepMode.onSWP) {
      window.mqSweepMode.onSWP((port, angle) => {
        if (port !== 1 && port !== 2) return;
        applyVisualAngle(port, angle);
      });
    }
    // Repaint the current sweep button's text from the canonical state.
    // Always queries the DOM live so it works after innerHTML rewrites.
    function paintSweepButton(port) {
      const b = document.querySelector(`.mq-servo-sweep[data-port="${port}"]`);
      if (!b) return;
      b.textContent = sweeping[port] ? '⏸ Stop' : '▶ Sweep';
      // Toggle the .mq-servo-sweep-active class so CSS knows to pulse.
      b.classList.toggle('mq-servo-sweep-active', !!sweeping[port]);
    }
    // Document-level event delegation — single listener that survives any
    // number of setMode() innerHTML rewrites of the quick-buttons container.
    // Previous implementation bound to each button at init; setMode then
    // destroyed those bindings by replacing the parent's innerHTML, so the
    // sweep button silently stopped responding (incl. clicks meant to STOP
    // an in-flight sweep). Delegation reads .mq-servo-sweep at click time.
    document.addEventListener('click', (e) => {
      const b = e.target.closest('.mq-servo-sweep');
      if (!b) return;
      const port = +b.dataset.port;
      if (sweeping[port]) stopSweep(port);
      else                 startSweep(port);
    });

    // ---- 360° (continuous-rotation) servo mode ----
    // 180° (default): slider 0..180, dial shows position via horn rotation.
    // 360° (continuous): slider -100..+100 (speed), 0 = stop, sign = direction.
    //   Maps to the same SRV:port,angle wire format: speed s ∈ [-100,+100]
    //   becomes angle a = clamp(0, 180, 90 + s * 0.9). Visualization changes
    //   to a continuously-rotating disk whose RPM = |speed|.
    const mode = { 1: '180', 2: '180' };
    const spinTimers = { 1: null, 2: null };
    function styleModeBtn(btn, on, color) {
      btn.style.color = on ? color : 'var(--text-secondary, #93a8c4)';
      btn.style.borderColor = on ? color : 'var(--border, #1d3556)';
      btn.style.fontWeight = on ? '700' : '400';
      btn.classList.toggle('mq-servo-mode-active', on);
    }
    function setMode(port, m) {
      mode[port] = m;
      const slider  = port === 1 ? s1 : s2;
      const readout = port === 1 ? r1 : r2;
      const quickEl = document.getElementById('mqS' + port + 'Quick');
      const dial    = port === 1 ? dial1 : dial2;
      const big     = port === 1 ? big1 : big2;
      const color   = port === 1 ? '#00d4ff' : '#4ade80';
      // Update mode buttons styling
      document.querySelectorAll('.mq-servo-mode[data-port="' + port + '"]').forEach(b => {
        styleModeBtn(b, b.dataset.mode === m, color);
      });
      // Stop any continuous spin animation when switching modes
      if (spinTimers[port]) { cancelAnimationFrame(spinTimers[port]); spinTimers[port] = null; }
      // CRITICAL: stop any running sweep BEFORE we rewrite the buttons.
      // Otherwise the BLE animate keeps firing on the stale id while the
      // user's click on the new (re-rendered) button can't see/cancel it.
      if (sweeping[port]) {
        sweeping[port] = false;
        if (window.bleScheduler) window.bleScheduler.stop(`servo-sweep-${port}`);
      }
      if (m === '360') {
        // Rebuild slider as bipolar -100..+100, default 0 (stop).
        // Use setAttribute (not property assignment) — some browser
        // engines don't reliably refresh the draggable range when
        // min/max are set via property after initialization. The
        // attribute path forces a full re-evaluation.
        slider.setAttribute('min', '-100');
        slider.setAttribute('max', '100');
        slider.setAttribute('value', '0');
        slider.value = '0';
        if (readout) readout.textContent = '0%';
        if (big) big.textContent = '0%';
        // Quick presets become STOP / FWD / REV
        if (quickEl) {
          quickEl.innerHTML =
            '<button class="mq-servo-quick" data-port="' + port + '" data-speed="-100" style="flex:1; padding:5px; background:var(--card-bg-2, #0a1628); color:' + color + '; border:1px solid var(--border, #1d3556); border-radius:5px; cursor:pointer; font-size:10px;">⏪ -100%</button>' +
            '<button class="mq-servo-quick" data-port="' + port + '" data-speed="0"    style="flex:1; padding:5px; background:var(--card-bg-2, #0a1628); color:#f87171; border:1px solid var(--border, #1d3556); border-radius:5px; cursor:pointer; font-size:10px; font-weight:700;">⏹ STOP</button>' +
            '<button class="mq-servo-quick" data-port="' + port + '" data-speed="100"  style="flex:1; padding:5px; background:var(--card-bg-2, #0a1628); color:' + color + '; border:1px solid var(--border, #1d3556); border-radius:5px; cursor:pointer; font-size:10px;">⏩ +100%</button>' +
            '<button class="mq-servo-sweep" data-port="' + port + '" style="flex:1; padding:5px; background:var(--card-bg-2, #0a1628); color:#facc15; border:1px solid var(--border, #1d3556); border-radius:5px; cursor:pointer; font-size:10px;">▶ Sweep</button>';
          rewireQuickButtons();
        }
        // Send STOP (angle 90) to actually stop a continuous-rotation servo
        if (window.bleScheduler) window.bleScheduler.send('SRV:' + port + ',90', { coalesce: true }).catch(() => {});
        startContinuousSpin(port, 0);
        // Reset PWM scope to the STOP pulse width (1.5 ms = angle 90)
        lastShown = { port, angle: 90 };
        updateServoScope(90);
        renderCode();
      } else {
        // Restore positional defaults — same setAttribute pattern as 360°.
        slider.setAttribute('min', '0');
        slider.setAttribute('max', '180');
        slider.setAttribute('value', '90');
        slider.value = '90';
        if (readout) readout.textContent = '90°';
        if (big) big.textContent = '90°';
        // Re-enable the smooth snap transition for positional moves
        if (dial) dial.style.transition = 'transform 0.18s ease-out';
        if (quickEl) {
          quickEl.innerHTML =
            '<button class="mq-servo-quick" data-port="' + port + '" data-angle="0"   style="flex:1; padding:5px; background:var(--card-bg-2, #0a1628); color:' + color + '; border:1px solid var(--border, #1d3556); border-radius:5px; cursor:pointer; font-size:10px;">0°</button>' +
            '<button class="mq-servo-quick" data-port="' + port + '" data-angle="90"  style="flex:1; padding:5px; background:var(--card-bg-2, #0a1628); color:' + color + '; border:1px solid var(--border, #1d3556); border-radius:5px; cursor:pointer; font-size:10px;">90°</button>' +
            '<button class="mq-servo-quick" data-port="' + port + '" data-angle="180" style="flex:1; padding:5px; background:var(--card-bg-2, #0a1628); color:' + color + '; border:1px solid var(--border, #1d3556); border-radius:5px; cursor:pointer; font-size:10px;">180°</button>' +
            '<button class="mq-servo-sweep" data-port="' + port + '" style="flex:1; padding:5px; background:var(--card-bg-2, #0a1628); color:#facc15; border:1px solid var(--border, #1d3556); border-radius:5px; cursor:pointer; font-size:10px;">▶ Sweep</button>';
          rewireQuickButtons();
        }
        rotateDial(port, 90);
        setBigReadout(port, 90);
        lastShown = { port, angle: 90 };
        updateServoScope(90);
        renderCode();
      }
    }
    // In 360° mode the dial rotates continuously at a rate proportional to speed.
    // CSS `transition: transform 0.18s` would fight per-frame attribute changes
    // and cause judder — we kill the transition while spinning, restore on exit.
    function startContinuousSpin(port, speed) {
      if (spinTimers[port]) { cancelAnimationFrame(spinTimers[port]); spinTimers[port] = null; }
      const dial = port === 1 ? dial1 : dial2;
      if (!dial) return;
      // Kill the smooth-snap transition for the duration of continuous spin
      dial.style.transition = 'none';
      // Speed = 0 means "stop": leave the dial at its current angle, don't tick.
      if (speed === 0) {
        // Restore transition so a future 180°-mode return snaps smoothly
        dial.style.transition = 'transform 0.18s ease-out';
        return;
      }
      let angle = 0;
      const m = (dial.getAttribute('transform') || '').match(/rotate\(([-\d.]+)/);
      if (m) angle = parseFloat(m[1]);
      let last = performance.now();
      function tick(now) {
        const dt = now - last; last = now;
        // Cap dt so a tab-switch hiccup doesn't jump the angle
        const safeDt = Math.min(dt, 100);
        // Max ~360 deg/sec at speed=100 (one revolution per second — visible)
        angle = (angle + (speed / 100) * 360 * (safeDt / 1000));
        // Wrap to keep numbers bounded
        if (angle > 360 || angle < -360) angle = angle % 360;
        dial.setAttribute('transform', `rotate(${angle.toFixed(1)} 100 100)`);
        spinTimers[port] = requestAnimationFrame(tick);
      }
      spinTimers[port] = requestAnimationFrame(tick);
    }
    function setSpeed(port, speedPct) {
      speedPct = Math.max(-100, Math.min(100, +speedPct));
      const slider = port === 1 ? s1 : s2;
      const readout = port === 1 ? r1 : r2;
      const big = port === 1 ? big1 : big2;
      if (slider && +slider.value !== speedPct) slider.value = speedPct;
      if (readout) readout.textContent = (speedPct > 0 ? '+' : '') + speedPct + '%';
      if (big) { big.textContent = (speedPct > 0 ? '+' : '') + speedPct + '%'; }
      // Map -100..+100 -> 0..180 for the SRV verb
      // -100% -> 1.0 ms (90+(-100)*0.9 = 0°)
      //    0% -> 1.5 ms (90° = STOP for a continuous-rotation servo)
      // +100% -> 2.0 ms (180°)
      const angle = Math.max(0, Math.min(180, Math.round(90 + speedPct * 0.9)));
      lastShown = { port, angle };
      // Same PWM scope used in 180° mode — pulse width is what the
      // continuous-rotation servo actually reads, just interpreted as
      // direction+rate instead of position. So showing it changing as
      // the user adjusts speed is exactly the right thing.
      updateServoScope(angle);
      renderCode();
      if (window.bleScheduler) {
        flashStatus('… sending', '#fbbf24');
        window.bleScheduler.send(`SRV:${port},${angle}`, { coalesce: true })
          .then(({ latency } = {}) => flashStatus('✓ ' + Math.round(latency || 0) + ' ms', '#4ade80'))
          .catch(err => flashStatus('✗ ' + (err && err.message || 'err'), '#f87171'));
      }
      startContinuousSpin(port, speedPct);
    }
    // Rewire slider behavior to dispatch to the right handler based on current mode
    function modeAwareSlider(port, val) {
      if (mode[port] === '360') setSpeed(port, val);
      else setAngle(port, val);
    }
    s1.addEventListener('input', e => modeAwareSlider(1, +e.target.value));
    s2.addEventListener('input', e => modeAwareSlider(2, +e.target.value));
    // Wire mode toggle buttons
    document.querySelectorAll('.mq-servo-mode').forEach(b => {
      b.addEventListener('click', () => setMode(+b.dataset.port, b.dataset.mode));
    });
    function rewireQuickButtons() {
      document.querySelectorAll('.mq-servo-quick').forEach(b => {
        b.addEventListener('click', () => {
          const port = +b.dataset.port;
          if (mode[port] === '360' && b.dataset.speed != null) {
            setSpeed(port, +b.dataset.speed);
          } else if (b.dataset.angle != null) {
            setAngle(port, +b.dataset.angle);
          }
        });
      });
    }

    // Code-view tab toggle
    document.querySelectorAll('.mq-servo-codetab').forEach(b => {
      b.addEventListener('click', () => {
        codeTab = b.dataset.tab;
        document.querySelectorAll('.mq-servo-codetab').forEach(x => {
          const active = x === b;
          x.classList.toggle('mq-servo-codetab-active', active);
          x.style.background = active ? '#1d3556' : '#0a1628';
          x.style.color = active ? '#00d4ff' : '#93a8c4';
          x.style.borderColor = active ? '#00d4ff' : '#1d3556';
        });
        renderCode();
      });
    });

    // Initial render
    rotateDial(1, 90);
    rotateDial(2, 90);
    renderCode();
    rewireQuickButtons();   // wires the 180°-mode quick buttons (0/90/180)
    document.getElementById('mqKitPicker').addEventListener('change', e => applyKit(e.target.value));

    // Restore saved kit
    let saved = 'base';
    try { saved = localStorage.getItem('maqueen.kit') || 'base'; } catch {}
    document.getElementById('mqKitPicker').value = saved;
    applyKit(saved);
  }

  // -------- SHARED: glossy-dome state helpers --------------
  // Three element types are routed through here:
  //  1. CSS .mq-glossy-dome divs (LineL/R, IR receiver) — toggle via
  //     background-color + .mq-on class
  //  2. SVG-based 5mm LED domes (mqLedDomeL/R) — swap lens fill +
  //     toggle halo circle opacity. Identified by presence of a child
  //     <svg> with a [id^="mqLedLens"] inside it.
  function setDomeOn(el, color, on) {
    if (!el) return;
    // SVG-based LED? Use EXACT id matches (mqLedLensL / mqLedLensR /
    // mqLedHaloL / mqLedHaloR) — earlier we used a prefix selector
    // [id^="mqLedLens"] which silently matched the GRADIENT defs
    // (mqLedLensOff_L, mqLedLensOn_L) FIRST in document order, so
    // we were setting fill on a <radialGradient> element (no visible
    // effect) and the lens circle never updated.
    const side = el.id && el.id.endsWith('L') ? 'L' : 'R';
    const lens = el.querySelector && el.querySelector('#mqLedLens' + side);
    const halo = el.querySelector && el.querySelector('#mqLedHalo' + side);
    if (lens) {
      lens.setAttribute('fill', on ? `url(#mqLedLensOn_${side})` : `url(#mqLedLensOff_${side})`);
      if (halo) halo.setAttribute('opacity', on ? '1' : '0');
      return;
    }
    // Fallback: legacy glossy-dome div
    if (on) {
      el.style.backgroundColor = color;
      el.classList.add('mq-on');
    } else {
      el.style.backgroundColor = '#1d3556';
      el.classList.remove('mq-on');
    }
  }

  // -------- SHARED: sparkline (last-N values → SVG polyline) ---
  // Returns an object with push(v) to feed values; also auto-decays
  // when no new value arrives so the line doesn't lie about freshness.
  function makeSparkline(pathEl, opts) {
    opts = opts || {};
    const max = opts.max != null ? opts.max : 100;
    const samples = opts.samples || 30;
    const buf = [];
    function render() {
      if (!pathEl || !buf.length) return;
      const w = 100, h = opts.h != null ? opts.h : 24;
      const step = w / Math.max(1, samples - 1);
      const pts = buf.map((v, i) => {
        const x = i * step;
        const y = h - Math.max(0, Math.min(1, v / max)) * h;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      });
      pathEl.setAttribute('d', 'M' + pts.join(' L'));
    }
    return {
      push(v) {
        buf.push(+v);
        if (buf.length > samples) buf.shift();
        render();
      },
      reset() { buf.length = 0; if (pathEl) pathEl.setAttribute('d', ''); }
    };
  }

  // -------- SHARED: status orb (.mq-orb-on / .mq-orb-warn / .mq-orb-err / off) ---
  function setOrb(el, mode, label) {
    if (!el) return;
    el.classList.remove('mq-orb-on', 'mq-orb-warn', 'mq-orb-err');
    if (mode) el.classList.add('mq-orb-' + mode);
    if (label != null) el.textContent = label;
  }

  // -------- SIMPLE LEDS -----------------------------------
  function initLEDs() {
    const domeL = document.getElementById('mqLedDomeL');
    const domeR = document.getElementById('mqLedDomeR');
    const btns = document.querySelectorAll('.mq-led-btn');
    if (!btns.length) return;
    const stateLabel = (idx) => document.getElementById(idx === '0' ? 'mqLedDomeLState' : 'mqLedDomeRState');
    const tape = document.getElementById('mqLedLastVerb');
    // Track each LED's current state for the scope trace
    const ledOn = { '0': false, '1': false };
    function updateLedScope() {
      const pL = document.getElementById('mqLedScopeL');
      const pR = document.getElementById('mqLedScopeR');
      // Each side spans half the 200px viewport. y=10 = HIGH, y=30 = LOW.
      // Draw an edge transition in the middle of each half.
      if (pL) {
        if (ledOn['0']) pL.setAttribute('d', 'M 0 30 L 10 30 L 10 10 L 100 10');
        else            pL.setAttribute('d', 'M 0 30 L 100 30');
      }
      if (pR) {
        if (ledOn['1']) pR.setAttribute('d', 'M 100 30 L 110 30 L 110 10 L 200 10');
        else            pR.setAttribute('d', 'M 100 30 L 200 30');
      }
    }
    function updateLed(idx, on) {
      const dome = idx === '0' ? domeL : domeR;
      const lbl = stateLabel(idx);
      setDomeOn(dome, '#facc15', on);
      if (lbl) lbl.textContent = on ? 'ON' : 'OFF';
      const verb = `LED:${idx},${on ? 1 : 0}`;
      if (tape) tape.textContent = verb;
      ledOn[idx] = on;
      updateLedScope();
      try { mqAnat.led(+idx, on); } catch {}
      send(verb);
    }
    updateLedScope();
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = btn.dataset.led;
        const next = btn.dataset.state === '0' ? '1' : '0';
        btn.dataset.state = next;
        updateLed(idx, next === '1');
      });
    });

    document.getElementById('mqLedAllOff').addEventListener('click', async () => {
      btns.forEach(b => { b.dataset.state = '0'; });
      setDomeOn(domeL, '#facc15', false); setDomeOn(domeR, '#facc15', false);
      const lblL = stateLabel('0'); const lblR = stateLabel('1');
      if (lblL) lblL.textContent = 'OFF';
      if (lblR) lblR.textContent = 'OFF';
      ledOn['0'] = false; ledOn['1'] = false; updateLedScope();
      if (tape) tape.textContent = 'LED:*,0';
      await send('LED:0,0');
      await send('LED:1,0');
    });

    document.getElementById('mqLedBlink').addEventListener('click', async () => {
      for (let i = 0; i < 5; i++) {
        btns.forEach(b => b.dataset.state = '1');
        setDomeOn(domeL, '#facc15', true); setDomeOn(domeR, '#facc15', true);
        if (stateLabel('0')) stateLabel('0').textContent = 'ON';
        if (stateLabel('1')) stateLabel('1').textContent = 'ON';
        if (tape) tape.textContent = 'LED:*,1';
        await send('LED:0,1');
        await send('LED:1,1');
        await new Promise(r => setTimeout(r, 200));
        btns.forEach(b => b.dataset.state = '0');
        setDomeOn(domeL, '#facc15', false); setDomeOn(domeR, '#facc15', false);
        if (stateLabel('0')) stateLabel('0').textContent = 'OFF';
        if (stateLabel('1')) stateLabel('1').textContent = 'OFF';
        if (tape) tape.textContent = 'LED:*,0';
        await send('LED:0,0');
        await send('LED:1,0');
        await new Promise(r => setTimeout(r, 200));
      }
    });
  }

  // -------- 4× RGB ----------------------------------------
  let rainbowTimer = null;
  function setPearl(i, hex) {
    const p = document.getElementById('mqPearl' + i);
    if (p) p.style.setProperty('--c', hex);
    try { mqAnat.neo(i, hex); } catch {}
  }
  function setPearlRGB(i, r, g, b) {
    const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    setPearl(i, hex);
    if (+i === 0) updateNeoFrame(g, r, b);   // pixel 0 drives the WS2812 scope
  }
  // WS2812 frame visualization for pixel 0 (24 bits, GRB order).
  // Render the bit cells inside the SVG path.
  function updateNeoFrame(g, r, b) {
    const trace = document.getElementById('mqNeoFrameTrace');
    const lbl = document.getElementById('mqNeoFrameLabel');
    if (!trace) return;
    const bits = [];
    [g, r, b].forEach(byte => {
      for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
    });
    // Place 24 bit cells in the area x=160..395, y=15..45
    const xStart = 160, xEnd = 395, top = 15, bot = 45;
    const bitW = (xEnd - xStart) / 24;
    let d = `M ${xStart} ${bot}`;
    bits.forEach((bit, i) => {
      const x0 = xStart + i * bitW;
      // "0" = short HIGH (~30% of cell), "1" = long HIGH (~65%)
      const hiW = bit ? bitW * 0.65 : bitW * 0.30;
      d += ` L ${x0.toFixed(1)} ${top} L ${(x0 + hiW).toFixed(1)} ${top} L ${(x0 + hiW).toFixed(1)} ${bot} L ${(x0 + bitW).toFixed(1)} ${bot}`;
    });
    trace.setAttribute('d', d);
    if (lbl) {
      const hex = v => v.toString(16).padStart(2, '0').toUpperCase();
      lbl.textContent = `G:${hex(g)} R:${hex(r)} B:${hex(b)}`;
    }
  }
  function initRGB() {
    const pickers = document.querySelectorAll('.mq-rgb-picker');
    if (!pickers.length) return;
    // Mirror initial picker colors onto pearls
    pickers.forEach(p => setPearl(p.dataset.i, p.value));
    pickers.forEach(p => {
      p.addEventListener('input', e => {
        const i = e.target.dataset.i;
        const { r, g, b } = hexToRGB(e.target.value);
        setPearl(i, e.target.value);
        sendCoalesced(`RGB:${i},${r},${g},${b}`);
      });
    });
    document.getElementById('mqRgbAllOff').addEventListener('click', () => {
      if (rainbowTimer) { clearInterval(rainbowTimer); rainbowTimer = null; }
      for (let i = 0; i < 4; i++) {
        setPearlRGB(i, 0, 0, 0);
        send(`RGB:${i},0,0,0`);
      }
    });
    document.getElementById('mqRgbRainbow').addEventListener('click', () => {
      if (rainbowTimer) { clearInterval(rainbowTimer); rainbowTimer = null; return; }
      let phase = 0;
      rainbowTimer = setInterval(() => {
        for (let i = 0; i < 4; i++) {
          const hue = (phase + i * 90) % 360;
          const { r, g, b } = hslToRgb(hue, 100, 50);
          setPearlRGB(i, r, g, b);
          sendCoalesced(`RGB:${i},${r},${g},${b}`);
        }
        phase = (phase + 18) % 360;
      }, 250);
    });
  }
  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
  }

  // -------- BUZZER ----------------------------------------
  function initBuzzer() {
    const freqEl = document.getElementById('mqBuzzFreq');
    const msEl = document.getElementById('mqBuzzMs');
    const wavePath = document.getElementById('mqBuzzWavePath');
    const freqDisp = document.getElementById('mqBuzzFreqDisplay');
    const msDisp = document.getElementById('mqBuzzMsDisplay');
    if (!freqEl) return;

    function updateWave() {
      const f = +freqEl.value || 440;
      // Visualize "cycles per 200px viewport" — high freq = denser wave.
      // Map 50–2000 Hz to 1–10 cycles for readable density.
      const cycles = Math.max(1, Math.min(14, Math.round(f / 150)));
      const w = 200, h = 40, mid = 20, amp = 14;
      const samples = 60;
      let d = `M 0 ${mid}`;
      for (let i = 1; i <= samples; i++) {
        const x = (i / samples) * w;
        const y = mid - amp * Math.sin((i / samples) * cycles * 2 * Math.PI);
        d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      if (wavePath) wavePath.setAttribute('d', d);
      if (freqDisp) freqDisp.textContent = f;
      if (msDisp) msDisp.textContent = msEl.value || 200;
    }
    updateWave();
    freqEl.addEventListener('input', updateWave);
    msEl.addEventListener('input', updateWave);

    // Pulse the piezo sound-wave rings for the chosen duration
    const wavesEl = document.getElementById('mqBuzzWaves');
    function pulseWaves(durationMs) {
      if (!wavesEl) return;
      wavesEl.style.opacity = '1';
      clearTimeout(pulseWaves._t);
      pulseWaves._t = setTimeout(() => { wavesEl.style.opacity = '0'; }, durationMs);
      try { mqAnat.buzzer(durationMs); } catch {}
    }
    document.querySelectorAll('.mq-note').forEach(n => {
      n.addEventListener('click', () => {
        const f = +n.dataset.freq;
        const ms = +msEl.value || 200;
        freqEl.value = f;
        updateWave();
        n.classList.add('mq-active');
        setTimeout(() => n.classList.remove('mq-active'), 180);
        pulseWaves(ms);
        send(`BUZZ:${f},${ms}`);
      });
    });
    document.getElementById('mqBuzzPlay').addEventListener('click', () => {
      const ms = +msEl.value || 200;
      updateWave();
      pulseWaves(ms);
      send(`BUZZ:${freqEl.value || 440},${ms}`);
    });
    document.getElementById('mqBuzzOff').addEventListener('click', () => {
      if (wavesEl) wavesEl.style.opacity = '0';
      send('BUZZ:0,0');
    });
  }

  // -------- 🔊 SONAR AUDIO PING ---------------------------
  // Optional audio feedback for sonar readings — submarine / Geiger-
  // counter aesthetic. Each setDist() call plays a tiny pip whose
  // PITCH and VOLUME both scale with distance: close = high & loud,
  // far = low & soft. Off by default (lazy AudioContext init — no
  // node created until the user opts in, so the page makes zero
  // noise on load and Chrome's autoplay policy stays clean).
  //
  // Why a single sine + 60 ms exponential envelope:
  //   - Square-ish (sine + sharp ramp) = audible click without harsh harmonics
  //   - Exponential decay ≈ ear-friendly; no "click" tail
  //   - Skip if cm out-of-range so a 'no echo' read is silent
  const mqAudioPing = (function () {
    const KEY = 'maqueen.audioPing';
    let enabled = false;
    let ctx = null;
    try { enabled = localStorage.getItem(KEY) === '1'; } catch {}

    function getCtx() {
      if (ctx) return ctx;
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {}
      return ctx;
    }
    function ensureRunning() {
      const ac = getCtx();
      if (!ac) return null;
      // Browsers suspend AudioContext until a user gesture. The toggle
      // click counts as one — resume() inside that handler unlocks it.
      if (ac.state === 'suspended') ac.resume().catch(() => {});
      return ac;
    }
    // Each radar style has its OWN audio voice — the user wanted
    // 'sonar audio too. funny'. Voices read the active radar style
    // from localStorage at every ping (so switching styles instantly
    // changes the sound, no re-wiring needed).
    function getStyle() {
      try { return localStorage.getItem('maqueen.radarStyle') || 'bat'; }
      catch { return 'bat'; }
    }
    function ping(cm) {
      if (!enabled) return;
      if (!(cm > 0 && cm < 500)) return;     // no echo / out of range
      const ac = ensureRunning();
      if (!ac || ac.state !== 'running') return;
      const style = getStyle();
      const t = Math.max(0, Math.min(1, cm / 100));   // 0=close, 1=far
      const now = ac.currentTime;
      switch (style) {
        case 'sonar': return voiceSonar(ac, now, t);
        case 'lidar': return voiceLidar(ac, now, t);
        case 'heat':  return voiceHeat(ac, now, t);
        case 'sweep': return voiceSweep(ac, now, t);
        default:      return voiceBat(ac, now, t);
      }
    }

    // Helper: build a one-shot oscillator + envelope and auto-stop.
    function tone(ac, now, opts) {
      const osc = ac.createOscillator();
      osc.type = opts.wave || 'sine';
      if (opts.freqStart != null && opts.freqEnd != null) {
        osc.frequency.setValueAtTime(opts.freqStart, now);
        osc.frequency.exponentialRampToValueAtTime(opts.freqEnd, now + (opts.sweepMs || opts.decayMs) / 1000);
      } else {
        osc.frequency.value = opts.freq;
      }
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(opts.vol, now + (opts.attackMs || 3) / 1000);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + opts.decayMs / 1000);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(now);
      osc.stop(now + opts.decayMs / 1000 + 0.02);
    }

    // 🦇 BAT — sharp ultrasonic chirp with a quick downward sweep
    // (mimics real bat echolocation). Higher pitch when close.
    function voiceBat(ac, now, t) {
      const start = 2200 - t * 1200;   // close 2200, far 1000
      tone(ac, now, {
        wave: 'sine',
        freqStart: start, freqEnd: start * 0.55,
        attackMs: 2, decayMs: 50, sweepMs: 50,
        vol: 0.05 + (1 - t) * 0.10,
      });
    }
    // 🟢 SONAR — classic submarine ping: deep tone, long exponential
    // decay, slight downward pitch slide. The "BWWWooop" you hear in
    // every WW2 movie. Loudest of the bunch — it's the dramatic one.
    function voiceSonar(ac, now, t) {
      const start = 700 - t * 200;     // close 700, far 500 Hz
      tone(ac, now, {
        wave: 'sine',
        freqStart: start, freqEnd: start * 0.6,
        attackMs: 5, decayMs: 480, sweepMs: 380,
        vol: 0.10 + (1 - t) * 0.10,
      });
    }
    // 🤖 LIDAR — short digital "pew", square-ish wave for that
    // crisp laser-zap feel. Very brief.
    function voiceLidar(ac, now, t) {
      tone(ac, now, {
        wave: 'square',
        freqStart: 1800 - t * 600,   // 1800..1200
        freqEnd:   1100 - t * 400,
        attackMs: 1, decayMs: 30, sweepMs: 30,
        vol: 0.04 + (1 - t) * 0.06,
      });
    }
    // 🔥 HEAT — wide pitch range mapped to "warm vs cool". Close = high
    // sharp tone (HOT), far = low warm tone (cool).
    function voiceHeat(ac, now, t) {
      tone(ac, now, {
        wave: 'triangle',
        freq: 200 + (1 - t) * 1400,  // far 200 Hz, close 1600 Hz
        attackMs: 4, decayMs: 100,
        vol: 0.05 + (1 - t) * 0.08,
      });
    }
    // 📡 SWEEP — short white-noise-ish click via square wave at
    // very high pitch. Like the radar tick from old movies.
    function voiceSweep(ac, now, t) {
      tone(ac, now, {
        wave: 'square',
        freq: 3000 - t * 800,
        attackMs: 1, decayMs: 25,
        vol: 0.03 + (1 - t) * 0.05,
      });
    }
    function setEnabled(on) {
      enabled = !!on;
      try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch {}
      // Resume immediately so the very next ping is audible (no one-pip lag).
      if (enabled) ensureRunning();
    }
    return { ping, setEnabled, isEnabled: () => enabled };
  })();

  // -------- 🚦 AUTO-WANDER --------------------------------
  // Hands-off demo: robot drives forward, polls sonar, turns on its
  // own when it sees an obstacle. Classic "perception → decision →
  // action" loop — the same one taught in every intro-robotics class.
  //
  // Behavior (state machine: forward → scanning → turning → forward)
  //   - Forward at 70% of the user's current speed slider value, S1
  //     servo centered (90°) so the sonar sees what's straight ahead.
  //   - Sonar < OBSTACLE_CM → STOP, enter SCANNING phase.
  //   - SCANNING: pan S1 through 3 angles (30° / 90° / 150°), wait for
  //     a sonar reading at each, record cm. This is the robot LITERALLY
  //     looking around.
  //   - Pick the angle with the maximum clearance, convert servo angle
  //     to robot turn (servo 30° = sonar pointing right of forward, so
  //     rotate right; servo 150° = left, rotate left; 90° = forward,
  //     no rotation needed). Spin duration scales with how much we
  //     need to rotate (≈ 60° offset → ~470 ms, full 90° → ~700 ms).
  //   - Re-center S1 servo to 90° before resuming forward so the next
  //     obstacle scan starts from a known orientation.
  //   - Any manual drive command (key/button/joystick) auto-cancels
  //     wander — fireDrive() detects non-wander calls and stops it.
  //   - Stops on disconnect; re-centers servo on stop.
  const mqWander = (function () {
    // OBSTACLE_CM is now USER-TUNABLE via the slider next to the
    // wander button. Stored in localStorage so the user's choice
    // survives reload. Read live in onDistance() so the change
    // takes effect mid-wander.
    const OBSTACLE_KEY     = 'maqueen.wanderObstacle';
    const OBSTACLE_DEFAULT = 25;
    const OBSTACLE_MIN     = 10;
    const OBSTACLE_MAX     = 80;
    let obstacleCm = OBSTACLE_DEFAULT;
    try {
      const v = +localStorage.getItem(OBSTACLE_KEY);
      if (v >= OBSTACLE_MIN && v <= OBSTACLE_MAX) obstacleCm = v;
    } catch {}
    function getObstacleCm() { return obstacleCm; }
    function setObstacleCm(v) {
      v = Math.max(OBSTACLE_MIN, Math.min(OBSTACLE_MAX, +v || OBSTACLE_DEFAULT));
      obstacleCm = v;
      try { localStorage.setItem(OBSTACLE_KEY, String(v)); } catch {}
    }
    const TURN_BASE        = 150;    // in-place spin wheel speed
    const FORWARD_BASE_PCT = 0.70;   // fraction of speed slider
    const SCAN_ANGLES      = [30, 90, 150];   // S1 angles to sample
    const SCAN_DWELL_MS    = 350;    // wait between servo set + sonar read
    const ROTATE_MS_PER_DEG = 8;     // ≈ 720 ms for 90° turn
    const NEUTRAL_DEG      = 5;      // no-turn dead-zone

    let active   = false;
    let phase    = 'idle';           // 'idle' | 'forward' | 'scanning' | 'turning'
    let scanIdx  = 0;
    let scanResults = [];            // cm at each SCAN_ANGLES[i]
    let phaseTimer = null;
    let lastSonarCm = 0;
    let _ourCallFlag = false;        // set briefly while WE invoke fireDrive
    let _ourServoFlag = false;       // set briefly while WE pan the servo

    function paint() {
      const btn = document.getElementById('mqDriveAutoWander');
      if (!btn) return;
      btn.classList.toggle('mq-wander-active', active);
      // Phase-aware label so the user can see what the robot is doing.
      let key, fallback;
      if (!active) {
        key = 'mq_drive_wander';      fallback = '🚦 Auto wander';
      } else if (phase === 'scanning') {
        key = 'mq_drive_wander_scan'; fallback = '🔍 Scanning…';
      } else if (phase === 'turning') {
        key = 'mq_drive_wander_turn'; fallback = '↺ Turning…';
      } else {
        key = 'mq_drive_wander_stop'; fallback = '⏹ Stop wander';
      }
      btn.setAttribute('data-i18n', key);
      btn.textContent = (window.t && typeof window.t === 'function')
        ? (window.t(key) || fallback)
        : fallback;
    }
    function safeFire(L, R) {
      _ourCallFlag = true;
      try { fireDrive(L, R, { coalesce: true }); }
      finally { _ourCallFlag = false; }
    }
    function setServo(deg) {
      // Coalesced send so back-to-back scan steps don't queue. Mark with
      // _ourServoFlag in case any future override logic wants to ignore
      // wander-issued servo moves (currently unused but cheap to maintain).
      _ourServoFlag = true;
      try {
        if (window.bleScheduler) {
          window.bleScheduler.send('SRV:1,' + deg, { coalesce: true }).catch(() => {});
        }
        // Also nudge the visualizers so the radar beam / mascot antenna
        // pivot in lockstep with the scan — these would normally be fed
        // from setAngle() but setAngle isn't called for our raw send.
        try { mqSweepRadar.recordAngle(deg); } catch {}
        try { mqOdometry.recordAngle(deg); } catch {}
        try { mqMascot.sonarServo(deg); } catch {}
      } finally { _ourServoFlag = false; }
    }
    function clearTimer() {
      if (phaseTimer) { clearTimeout(phaseTimer); phaseTimer = null; }
    }

    function enterForward() {
      if (!active) return;
      phase = 'forward';
      paint();
      // Centre the sonar so the obstacle test reflects what's ahead.
      setServo(90);
      const slider = document.getElementById('mqSpeedSlider');
      const userSpeed = slider ? +slider.value : 200;
      const v = Math.round(userSpeed * FORWARD_BASE_PCT);
      safeFire(v, v);
    }

    function enterScanning() {
      if (!active) return;
      phase = 'scanning';
      scanIdx = 0;
      scanResults = [];
      safeFire(0, 0);                 // halt motion before scanning
      paint();
      scanStep();
    }
    function scanStep() {
      if (!active || phase !== 'scanning') return;
      if (scanIdx >= SCAN_ANGLES.length) { decideAndTurn(); return; }
      const angle = SCAN_ANGLES[scanIdx];
      setServo(angle);
      // Give the servo time to slew + the next polled DIST? to land.
      // We use the LATEST lastSonarCm at the end of the dwell — it's
      // updated by onDistance() as readings come in.
      clearTimer();
      phaseTimer = setTimeout(() => {
        if (!active || phase !== 'scanning') return;
        scanResults[scanIdx] = lastSonarCm;
        scanIdx++;
        scanStep();
      }, SCAN_DWELL_MS);
    }
    function decideAndTurn() {
      if (!active) return;
      // Pick the index with the max reading. Treat 0 (no echo) as
      // "infinite clearance" — that's a perfectly safe direction.
      let bestIdx = 0;
      let bestVal = -1;
      for (let i = 0; i < scanResults.length; i++) {
        const v = scanResults[i] === 0 ? 9999 : scanResults[i];
        if (v > bestVal) { bestVal = v; bestIdx = i; }
      }
      // servo 30° = sonar pointing right of forward → robot turns right
      // servo 90° = forward → no turn
      // servo 150° = left → robot turns left
      // offset = 90 − targetAngle. Positive = turn right (L+, R−).
      const targetAngle = SCAN_ANGLES[bestIdx];
      const offsetDeg = 90 - targetAngle;
      if (Math.abs(offsetDeg) <= NEUTRAL_DEG) {
        // Best clearance is straight ahead — no need to turn, just go.
        enterForward();
        return;
      }
      phase = 'turning';
      paint();
      const turnMs = Math.max(180, Math.abs(offsetDeg) * ROTATE_MS_PER_DEG);
      const dir = offsetDeg > 0 ? +1 : -1;
      safeFire(dir * TURN_BASE, -dir * TURN_BASE);
      clearTimer();
      phaseTimer = setTimeout(() => { enterForward(); }, turnMs);
    }

    function start() {
      if (active) return;
      active = true;
      enterForward();
    }
    function stop() {
      if (!active) return;
      active = false;
      phase = 'idle';
      clearTimer();
      // Real STOP so the robot halts; re-centre the servo so the next
      // session (or manual sonar read) sees forward by default.
      safeFire(0, 0);
      setServo(90);
      paint();
    }
    // External cancel — manual fireDrive lands; we just disengage.
    // Don't issue STOP (the manual call IS the new motion) but DO
    // re-centre the servo since we may have left it panned mid-scan.
    function cancel() {
      if (!active) return;
      active = false;
      phase = 'idle';
      clearTimer();
      setServo(90);
      paint();
    }
    function onDistance(cm) {
      if (!active) return;
      // Cache for the SCANNING dwell to read at the end of each step.
      if (cm > 0 && cm < 500) lastSonarCm = cm;
      // Trigger a scan only from FORWARD phase. Ignore obstacle reads
      // during scanning/turning — those are part of the decision loop.
      if (phase !== 'forward') return;
      // Read obstacleCm LIVE so user-tuned threshold applies mid-wander.
      if (cm > 0 && cm < obstacleCm) {
        enterScanning();
      }
    }
    function isOurCall()  { return _ourCallFlag; }
    function isOurServo() { return _ourServoFlag; }
    return {
      start, stop, cancel, onDistance,
      isActive: () => active, isOurCall, isOurServo,
      getObstacleCm, setObstacleCm,
      OBSTACLE_MIN, OBSTACLE_MAX, OBSTACLE_DEFAULT,
    };
  })();

  // -------- 🎬 MACRO RECORD / REPLAY ----------------------
  // Capture up to 60 s of (timestamp, L, R) drive commands and play
  // them back at original timing. Persists across reload via
  // localStorage so a recording survives page refreshes — record
  // once, hand to a kid, hit replay.
  //
  // Override semantics
  //   - During PLAYBACK: any non-macro fireDrive() call (= the user
  //     grabbing the keypad / keyboard / joystick) cancels playback.
  //     Same _ourCallFlag pattern as mqWander.
  //   - During RECORDING: we capture EVERY fireDrive() — incl. ones
  //     issued by mqWander. The recording is "what the robot did",
  //     regardless of who told it to.
  //   - Recording is auto-stopped after MAX_DURATION_MS so a forgotten
  //     'Record' button doesn't fill localStorage indefinitely.
  const mqMacro = (function () {
    const STORAGE_KEY    = 'maqueen.lastMacro';
    const MAX_DURATION_MS = 60000;       // hard cap
    const PRELOAD_PAD_MS  = 200;         // tail STOP after last frame
    let state    = 'idle';               // 'idle' | 'recording' | 'playing'
    let frames   = [];                   // [{t, L, R}, ...]
    let recStart = 0;
    let playI    = 0;
    let playStart = 0;
    let playTimer = null;
    let recAutoStop = null;
    let statusTimer = null;
    let _ourCall = false;                // set briefly during playback's fireDrive

    // Restore last recording (if any) so 'Replay' is enabled on load.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) frames = parsed;
      }
    } catch {}

    function fmtSec(ms) { return (ms / 1000).toFixed(1) + ' s'; }

    function paint() {
      const recBtn  = document.getElementById('mqMacroRec');
      const playBtn = document.getElementById('mqMacroPlay');
      const status  = document.getElementById('mqMacroStatus');
      if (recBtn) {
        recBtn.classList.toggle('mq-macro-active', state === 'recording');
        const label = recBtn.querySelector('span:not(.mq-macro-icon)');
        if (label) {
          const key = state === 'recording' ? 'mq_macro_stop_rec' : 'mq_macro_rec';
          const fb  = state === 'recording' ? 'Stop'              : 'Record';
          label.setAttribute('data-i18n', key);
          label.textContent = (window.t && typeof window.t === 'function')
            ? (window.t(key) || fb) : fb;
        }
      }
      if (playBtn) {
        playBtn.classList.toggle('mq-macro-active', state === 'playing');
        playBtn.disabled = (state === 'recording') || (state === 'idle' && frames.length === 0);
        const label = playBtn.querySelector('span:not(.mq-macro-icon)');
        if (label) {
          const key = state === 'playing' ? 'mq_macro_stop_play' : 'mq_macro_play';
          const fb  = state === 'playing' ? 'Stop'                : 'Replay';
          label.setAttribute('data-i18n', key);
          label.textContent = (window.t && typeof window.t === 'function')
            ? (window.t(key) || fb) : fb;
        }
      }
      if (status) {
        status.classList.remove('mq-macro-status-rec', 'mq-macro-status-play');
        if (state === 'recording') {
          const elapsed = performance.now() - recStart;
          status.classList.add('mq-macro-status-rec');
          status.textContent = '⏺ REC ' + fmtSec(elapsed) + ' / ' + fmtSec(MAX_DURATION_MS);
          status.removeAttribute('data-i18n');
        } else if (state === 'playing') {
          const elapsed = performance.now() - playStart;
          const total = frames.length ? frames[frames.length - 1].t : 0;
          status.classList.add('mq-macro-status-play');
          status.textContent = '▶ PLAY ' + fmtSec(elapsed) + ' / ' + fmtSec(total);
          status.removeAttribute('data-i18n');
        } else {
          status.removeAttribute('data-i18n');
          if (frames.length === 0) {
            status.setAttribute('data-i18n', 'mq_macro_idle');
            status.textContent = (window.t && typeof window.t === 'function')
              ? (window.t('mq_macro_idle') || '— no recording —')
              : '— no recording —';
          } else {
            const total = frames[frames.length - 1].t;
            status.textContent = '✓ ' + frames.length + ' steps · ' + fmtSec(total);
          }
        }
      }
    }
    function startStatusTicker() {
      if (statusTimer) return;
      statusTimer = setInterval(() => {
        if (state === 'recording' || state === 'playing') paint();
        else { clearInterval(statusTimer); statusTimer = null; }
      }, 100);
    }

    // ---- Recording ------------------------------------------
    function startRec() {
      if (state !== 'idle') return;
      state = 'recording';
      frames = [];
      recStart = performance.now();
      paint();
      startStatusTicker();
      if (recAutoStop) clearTimeout(recAutoStop);
      recAutoStop = setTimeout(stopRec, MAX_DURATION_MS);
    }
    function stopRec() {
      if (state !== 'recording') return;
      if (recAutoStop) { clearTimeout(recAutoStop); recAutoStop = null; }
      state = 'idle';
      // Persist (only if we actually captured something)
      if (frames.length > 0) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(frames)); } catch {}
      }
      paint();
    }
    function recordCmd(L, R) {
      if (state !== 'recording') return;
      const t = performance.now() - recStart;
      // De-dup back-to-back identical (L,R) — same wheel state means the
      // robot kept doing the same thing, no need to record a duplicate.
      const last = frames[frames.length - 1];
      if (last && last.L === L && last.R === R) return;
      frames.push({ t, L, R });
    }

    // ---- Playback -------------------------------------------
    function play() {
      if (state !== 'idle' || frames.length === 0) return;
      state = 'playing';
      playI = 0;
      playStart = performance.now();
      paint();
      startStatusTicker();
      schedule();
    }
    function schedule() {
      if (state !== 'playing') return;
      if (playI >= frames.length) {
        // Tail: send a STOP shortly after the last frame so the robot
        // doesn't keep moving once the macro ends.
        playTimer = setTimeout(() => {
          if (state !== 'playing') return;
          _ourCall = true;
          try { fireDrive(0, 0); } finally { _ourCall = false; }
          stopPlay();
        }, PRELOAD_PAD_MS);
        return;
      }
      const cmd = frames[playI++];
      const elapsed = performance.now() - playStart;
      const wait = Math.max(0, cmd.t - elapsed);
      playTimer = setTimeout(() => {
        if (state !== 'playing') return;
        _ourCall = true;
        try { fireDrive(cmd.L, cmd.R, { coalesce: true }); }
        finally { _ourCall = false; }
        schedule();
      }, wait);
    }
    function stopPlay() {
      if (state !== 'playing') return;
      if (playTimer) { clearTimeout(playTimer); playTimer = null; }
      state = 'idle';
      paint();
    }
    function cancel() {
      // Called from fireDrive override. Only PLAYBACK auto-cancels on
      // manual drive — recording should keep capturing user input.
      if (state === 'playing') {
        if (playTimer) { clearTimeout(playTimer); playTimer = null; }
        state = 'idle';
        paint();
      }
    }

    // ---- Public surface -------------------------------------
    function isOurCall()    { return _ourCall; }
    function isPlaying()    { return state === 'playing'; }
    function isRecording()  { return state === 'recording'; }
    function toggleRec()    { (state === 'recording') ? stopRec() : startRec(); }
    function togglePlay()   { (state === 'playing')   ? stopPlay() : play(); }

    // Initial paint (DOM may not be ready yet — guarded inside paint()).
    paint();

    return {
      toggleRec, togglePlay,
      recordCmd, cancel,
      isOurCall, isPlaying, isRecording,
    };
  })();

  // -------- 🏁 TABLEAU DE BORD ----------------------------
  // Automotive cockpit dashboard. Four analog gauges + LCD trip
  // computer + warning cluster. Reads data already on the wire
  // (fireDrive L,R; mqOdometry pose+totalDist; setDist cm).
  //
  // Gauge needle convention: 270° sweep, -135° (left) to +135°
  // (right). For a value v in [0, max], rotation = -135 + (v/max)*270.
  // For the heading gauge, 360° direct rotation.
  // For the sonar gauge: INVERTED so close = right (alarm side).
  const mqDashboard = (function () {
    const SPEED_MAX  = 30;     // cm/s — typical Maqueen top speed
    const POWER_MAX  = 100;    // %
    const SONAR_MAX  = 100;    // cm — beyond this peg the needle "chill"

    let peakSpeed   = 0;       // cm/s
    let peakPower   = 0;       // %
    let driveMs     = 0;       // accumulated time motors were active
    let lastDriveT  = 0;       // performance.now() at last drive tick
    let isDriving   = false;
    let lastL = 0, lastR = 0;
    // ODO persists across resets; TRIP zeroes when user hits reset.
    let odoMeters  = 0;
    let tripMeters = 0;
    let lastTotalDist = 0;     // last seen mqOdometry totalDist (for delta)
    try {
      const v = +localStorage.getItem('maqueen.odoMeters');
      if (v && isFinite(v)) odoMeters = v;
    } catch {}

    // Generic needle update — rotates the SVG group around (50, 50).
    function setNeedle(id, angleDeg) {
      const el = document.getElementById(id);
      if (el) el.setAttribute('transform', `rotate(${angleDeg.toFixed(1)} 50 50)`);
    }
    function valToSweep(val, max) {
      const t = Math.max(0, Math.min(1, val / max));
      return -135 + t * 270;
    }
    function setText(id, str) {
      const el = document.getElementById(id);
      if (el && el.textContent !== str) el.textContent = str;
    }
    function setWarn(id, on) {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle('mq-dash-warn-on', !!on);
    }
    function setGear(letter) {
      const el = document.getElementById('mqDashGear');
      if (!el) return;
      if (el.dataset.gear !== letter) {
        el.dataset.gear = letter;
        el.textContent = letter;
      }
    }

    function fmtMeters(m) {
      // Show with cm precision when small, m precision when large.
      if (m < 1) return (m * 100).toFixed(0) + ' cm';
      return m.toFixed(2) + ' m';
    }
    function fmtMMSS(ms) {
      const s = Math.floor(ms / 1000);
      return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    }

    // Hooks ----------------------------------------------------
    // Wheel-velocity hook from fireDrive (post speed-scale).
    function recordMotors(L, R) {
      lastL = +L; lastR = +R;
      const mag = Math.max(Math.abs(L), Math.abs(R));
      const pwrPct = Math.min(100, (mag / 255) * 100);
      // Power gauge — main needle, peak marker
      setNeedle('mqGaugeNeedlePower', valToSweep(pwrPct, POWER_MAX));
      if (pwrPct > peakPower) {
        peakPower = pwrPct;
        setNeedle('mqGaugePeakPower', valToSweep(peakPower, POWER_MAX));
      }
      setText('mqGaugeValPower', Math.round(pwrPct));
      // Gear: avg sign of L,R determines D / N / R
      const avg = (L + R) / 2;
      const gear = (Math.abs(avg) < 5) ? 'N' : (avg > 0 ? 'D' : 'R');
      setGear(gear);
      // Drive-time clock — only counts while at least one motor is active
      const wasDriving = isDriving;
      isDriving = mag > 5;
      const now = performance.now();
      if (wasDriving && lastDriveT) driveMs += (now - lastDriveT);
      lastDriveT = isDriving ? now : 0;
    }
    // Pose hook from mqOdometry — gets called every render() tick at ~60 Hz.
    function recordPose(theta, totalDist) {
      // Heading gauge — direct degree mapping
      const hdgDeg = ((theta * 180 / Math.PI) % 360 + 360) % 360;
      setNeedle('mqGaugeNeedleHead', hdgDeg);
      setText('mqGaugeValHead', hdgDeg.toFixed(0));
      // Speed (cm/s) computed from totalDist delta — uses real wheel-speed
      // integral. We compute on the fly because mqOdometry tracks totalDist.
      const dDist = Math.max(0, totalDist - lastTotalDist);
      lastTotalDist = totalDist;
      // Gauge speed reading uses |v|, instantaneous-ish.
      // Pull from current motor estimate: v = (L+R)/2 * VEL_SCALE (25/200 cm/s/unit).
      const speedCmS = Math.abs((lastL + lastR) / 2 * (25 / 200));
      setNeedle('mqGaugeNeedleSpeed', valToSweep(speedCmS, SPEED_MAX));
      setText('mqGaugeValSpeed', speedCmS.toFixed(1));
      if (speedCmS > peakSpeed) {
        peakSpeed = speedCmS;
        setNeedle('mqGaugePeakSpeed', valToSweep(peakSpeed, SPEED_MAX));
      }
      // ODO + TRIP integrate the actual world-distance moved
      const dMeters = dDist / 100;
      odoMeters  += dMeters;
      tripMeters += dMeters;
      // Throttle localStorage writes — every 1 m of travel is plenty
      if (Math.floor(odoMeters * 100) % 100 === 0 && dMeters > 0) {
        try { localStorage.setItem('maqueen.odoMeters', odoMeters.toFixed(3)); } catch {}
      }
      // LCD strip
      setText('mqDashODO',  fmtMeters(odoMeters));
      setText('mqDashTRIP', fmtMeters(tripMeters));
      setText('mqDashPEAK', peakSpeed.toFixed(1) + ' cm/s');
      const avg = driveMs > 100 ? (tripMeters * 100) / (driveMs / 1000) : 0;
      setText('mqDashAVG', avg.toFixed(1) + ' cm/s');
      setText('mqDashTime', fmtMMSS(driveMs));
    }
    // Sonar — drives the SONAR gauge + COLLISION warning light.
    function recordDistance(cm) {
      const valid = cm > 0 && cm < 500;
      const valEl = document.getElementById('mqGaugeValSonar');
      if (!valid) {
        setNeedle('mqGaugeNeedleSonar', -135);
        if (valEl) valEl.textContent = '—';
        setWarn('mqDashWarnCol', false);
        return;
      }
      // Inverted scale: cm=0 → +135° (right, danger), cm=100+ → -135° (left, chill)
      const t = Math.min(1, cm / SONAR_MAX);
      setNeedle('mqGaugeNeedleSonar', 135 - t * 270);
      if (valEl) valEl.textContent = String(Math.round(cm));
      setWarn('mqDashWarnCol', cm < 10);
    }
    function recordLink(connected) {
      setWarn('mqDashWarnLink', !connected);
    }

    function reset() {
      peakSpeed = 0;
      peakPower = 0;
      driveMs = 0;
      tripMeters = 0;
      setNeedle('mqGaugePeakSpeed', valToSweep(0, SPEED_MAX));
      setNeedle('mqGaugePeakPower', valToSweep(0, POWER_MAX));
      setText('mqDashTRIP', fmtMeters(0));
      setText('mqDashPEAK', '0.0 cm/s');
      setText('mqDashAVG',  '0.0 cm/s');
      setText('mqDashTime', '00:00');
    }

    return { recordMotors, recordPose, recordDistance, recordLink, reset };
  })();

  // -------- 🎯 PATH CHALLENGES ----------------------------
  // Pick a target shape (square / circle / figure-8). The path SVG
  // draws a dashed outline. Score = how closely the trail covers
  // each TARGET point on average. Lower avg-distance = higher score.
  //
  // Why "target → trail" instead of "trail → target":
  //   Per-target measurement rewards COVERAGE: if the user drives
  //   only a corner of the square, target points far from that
  //   corner will have a large nearest-trail distance, dragging
  //   the average down. This catches the "I cheated by driving a
  //   tiny circle" case that the inverse direction wouldn't.
  //
  // Live scoring is throttled to ~3 Hz — full O(n*m) at 60 Hz
  // would be wasteful and visually flickery (each new trail point
  // would barely move the score).
  const mqChallenges = (function () {
    const SCALE_DENOM = {
      square: 12,    // avg distance ≥ 12 cm = 0%, ≤ 0 cm = 100%
      circle: 12,
      fig8:   14,
    };

    // Build target shapes. Each entry: { points: [{x,y}, ...] }.
    // Coordinates in cm, world frame (same as mqOdometry).
    function buildSquare(size) {
      const pts = [];
      const N = 24;                               // points per side
      // Square centered on (size/2, size/2) so the user starts in
      // a corner and drives counter-clockwise back to origin.
      for (let i = 0; i <= N; i++) pts.push({ x: (i / N) * size, y: 0 });
      for (let i = 1; i <= N; i++) pts.push({ x: size, y: (i / N) * size });
      for (let i = 1; i <= N; i++) pts.push({ x: size - (i / N) * size, y: size });
      for (let i = 1; i <= N; i++) pts.push({ x: 0, y: size - (i / N) * size });
      return pts;
    }
    function buildCircle(r) {
      const pts = [];
      const N = 80;
      // Circle centered at (0, r) so it's tangent to the origin.
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * 2 * Math.PI;
        pts.push({ x: r * Math.sin(a), y: r - r * Math.cos(a) });
      }
      return pts;
    }
    function buildFig8(r) {
      const pts = [];
      const N = 60;
      // Lower lobe (origin-tangent), then upper lobe.
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * 2 * Math.PI;
        pts.push({ x: r * Math.sin(a), y: r - r * Math.cos(a) });
      }
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * 2 * Math.PI;
        pts.push({ x: -r * Math.sin(a), y: r + r + r * Math.cos(a) });
      }
      return pts;
    }

    const SHAPES = {
      square: { points: buildSquare(40) },
      circle: { points: buildCircle(30) },
      fig8:   { points: buildFig8(20)   },
    };

    let currentName = '';
    let currentTarget = null;     // {points: [...]}
    let lastScore = 0;
    let bestByName = {};
    let lastScoreT = 0;

    try {
      // Restore last-picked shape and best scores
      currentName = localStorage.getItem('maqueen.challenge') || '';
      const raw = localStorage.getItem('maqueen.challengeBest');
      if (raw) bestByName = JSON.parse(raw);
    } catch {}
    if (currentName && SHAPES[currentName]) currentTarget = SHAPES[currentName];

    function getTarget() { return currentTarget; }
    function getName() { return currentName; }

    function setShape(name) {
      currentName = name || '';
      currentTarget = SHAPES[currentName] || null;
      try { localStorage.setItem('maqueen.challenge', currentName); } catch {}
      // Reset live score; best stays put.
      lastScore = 0;
      paintBadge();
    }

    function paintBadge() {
      const bar   = document.getElementById('mqChalStats');
      const score = document.getElementById('mqChalScore');
      const best  = document.getElementById('mqChalBest');
      if (!bar) return;
      if (!currentTarget) {
        bar.style.display = 'none';
        return;
      }
      bar.style.display = '';
      if (score) score.textContent = lastScore > 0 ? lastScore + '%' : '—';
      if (best)  best.textContent  = (bestByName[currentName] || 0) + '%';
    }

    // Compute score from the live trail. Throttled to ~3 Hz.
    // trail: [{x, y}, ...]
    function computeScore(trail) {
      if (!currentTarget) return 0;
      const target = currentTarget.points;
      if (target.length === 0 || trail.length === 0) return 0;
      // For each target point find nearest trail point. Avg the distances.
      let sum = 0;
      for (let i = 0; i < target.length; i++) {
        const tx = target[i].x, ty = target[i].y;
        let best = Infinity;
        for (let j = 0; j < trail.length; j++) {
          const dx = trail[j].x - tx, dy = trail[j].y - ty;
          const d2 = dx * dx + dy * dy;
          if (d2 < best) best = d2;
        }
        sum += Math.sqrt(best);
      }
      const avg = sum / target.length;
      // Map avg-distance → percentage. Smaller distance = better score.
      const denom = SCALE_DENOM[currentName] || 12;
      const pct = Math.max(0, Math.min(100, 100 - (avg / denom) * 100));
      return Math.round(pct);
    }

    function maybeUpdateScore(trail) {
      if (!currentTarget) return;
      const now = performance.now();
      if (now - lastScoreT < 333) return;       // throttle to ~3 Hz
      lastScoreT = now;
      const sc = computeScore(trail);
      if (sc !== lastScore) {
        lastScore = sc;
        const oldBest = bestByName[currentName] || 0;
        if (sc > oldBest) {
          bestByName[currentName] = sc;
          try { localStorage.setItem('maqueen.challengeBest', JSON.stringify(bestByName)); } catch {}
          // New-best celebration animation
          const bestEl = document.getElementById('mqChalBest');
          if (bestEl) {
            bestEl.classList.remove('mq-chal-new-best');
            void bestEl.offsetWidth;
            bestEl.classList.add('mq-chal-new-best');
          }
        }
        paintBadge();
      }
    }

    function reset() {
      lastScore = 0;
      paintBadge();
    }

    // Initial paint (DOM may not exist yet at module-load; safe no-op).
    paintBadge();

    return {
      SHAPES, getTarget, getName, setShape,
      maybeUpdateScore, reset, paintBadge,
    };
  })();

  // -------- 📸 SNAPSHOT -----------------------------------
  // Capture the current path map + dashboard stats as a PNG. Builds
  // a 900×700 canvas with: header + cloned-path-SVG (rendered via
  // data-URL → Image → drawImage) + a stats grid pulled from live
  // DOM text + a small footer. Filename is timestamped so successive
  // snapshots don't clobber each other.
  //
  // Uses zero external libraries — relies on the browser's native
  // SVG-to-Image rendering. Caveats:
  //   - Inline width/height set on the cloned SVG (browsers won't
  //     render an SVG with only a viewBox).
  //   - SVG attributes (stroke / fill / etc.) carry over but
  //     CSS variables won't — the path SVG already uses concrete
  //     hex colors so this is a non-issue.
  const mqSnapshot = (function () {

    function txt(id) {
      const el = document.getElementById(id);
      return el ? el.textContent.trim() : '—';
    }

    async function renderSvgToImage(svgEl, w, h) {
      // Clone so we can mutate width/height + ensure xmlns without
      // touching the live document.
      const clone = svgEl.cloneNode(true);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width',  w);
      clone.setAttribute('height', h);
      // Inline a background so the cropped PNG isn't transparent.
      clone.style.background = '#061121';
      const xml = new XMLSerializer().serializeToString(clone);
      // Use unescape(encodeURIComponent(...)) for non-ASCII safety.
      const url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
      return new Promise((resolve) => {
        const img = new Image();
        img.onload  = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      });
    }

    function drawHeader(ctx, W) {
      ctx.fillStyle = '#fb923c';
      ctx.font = 'bold 26px "JetBrains Mono", monospace';
      ctx.textBaseline = 'top';
      ctx.fillText('🤖 Maqueen Lab — Snapshot', 24, 22);
      ctx.fillStyle = '#93a8c4';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillText(new Date().toLocaleString(), 24, 56);
      // Hairline divider under the header
      ctx.strokeStyle = '#1d3556';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(24, 78);
      ctx.lineTo(W - 24, 78);
      ctx.stroke();
    }

    function drawStatsCol(ctx, x, y, w) {
      // Pull live values from DOM so the snapshot reflects what
      // the user is seeing right now. No state plumbing required.
      const items = [
        { key: 'ODO',      val: txt('mqDashODO'),      color: '#fb923c' },
        { key: 'TRIP',     val: txt('mqDashTRIP'),     color: '#fb923c' },
        { key: 'PEAK',     val: txt('mqDashPEAK'),     color: '#38bdf8' },
        { key: 'AVG',      val: txt('mqDashAVG'),      color: '#facc15' },
        { key: 'TIME',     val: txt('mqDashTime'),     color: '#93a8c4' },
        { key: 'HEADING',  val: txt('mqOdoHeading'),   color: '#4ade80' },
        { key: 'POSITION', val: txt('mqOdoPosition'),  color: '#00d4ff' },
        { key: 'DIST',     val: txt('mqOdoDistance'),  color: '#fb923c' },
      ];
      const cellH = 56;
      let cy = y;
      for (const it of items) {
        // Cell bg + frame
        ctx.fillStyle = '#0a1628';
        ctx.fillRect(x, cy, w, cellH);
        ctx.strokeStyle = '#1d3556';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, cy + 0.5, w - 1, cellH - 1);
        // Colored left accent (matches the Drive panel's per-cell hue)
        ctx.fillStyle = it.color;
        ctx.fillRect(x, cy, 3, cellH);
        // Key (small, dim)
        ctx.fillStyle = '#93a8c4';
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        ctx.textBaseline = 'top';
        ctx.fillText(it.key, x + 12, cy + 8);
        // Value (large, accent)
        ctx.fillStyle = it.color;
        ctx.font = 'bold 18px "JetBrains Mono", monospace';
        ctx.fillText(it.val, x + 12, cy + 24);
        cy += cellH + 6;
      }
    }

    function drawFooter(ctx, W, H) {
      ctx.fillStyle = '#93a8c4';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textBaseline = 'bottom';
      ctx.fillText('maqueen-lab · Web Bluetooth lab for DFRobot Maqueen Lite v4', 24, H - 18);
      // Build version on the right (if available)
      try {
        const ver = (window.BUILD_VERSION || '');
        if (ver) {
          ctx.textAlign = 'right';
          ctx.fillText(String(ver), W - 24, H - 18);
          ctx.textAlign = 'left';
        }
      } catch {}
    }

    async function takeSnapshot() {
      const W = 900, H = 700;
      const DPR = 2;     // 2× for retina-sharp output
      const canvas = document.createElement('canvas');
      canvas.width  = W * DPR;
      canvas.height = H * DPR;
      const ctx = canvas.getContext('2d');
      ctx.scale(DPR, DPR);
      // Background
      ctx.fillStyle = '#061121';
      ctx.fillRect(0, 0, W, H);
      // Header bar
      drawHeader(ctx, W);
      // Layout — path map left, stats column right
      const PAD     = 24;
      const TOP     = 96;
      const STAT_W  = 220;
      const MAP_X   = PAD;
      const MAP_W   = W - STAT_W - 3 * PAD;
      const MAP_H   = H - TOP - 60;
      const STAT_X  = MAP_X + MAP_W + PAD;
      // Path map (rendered from the live odometry SVG)
      const svg = document.getElementById('mqOdoSvg');
      if (svg) {
        const img = await renderSvgToImage(svg, MAP_W, MAP_H);
        if (img) {
          ctx.drawImage(img, MAP_X, TOP, MAP_W, MAP_H);
          ctx.strokeStyle = '#1d3556';
          ctx.lineWidth = 1;
          ctx.strokeRect(MAP_X + 0.5, TOP + 0.5, MAP_W - 1, MAP_H - 1);
        } else {
          // Fallback: empty placeholder
          ctx.fillStyle = '#0a1628';
          ctx.fillRect(MAP_X, TOP, MAP_W, MAP_H);
        }
      }
      // Stats column
      drawStatsCol(ctx, STAT_X, TOP, STAT_W);
      // Footer
      drawFooter(ctx, W, H);
      // Download — Blob + temporary <a> with downloads attribute
      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        a.href = URL.createObjectURL(blob);
        a.download = 'maqueen-snap-' + stamp + '.png';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        // Clean up the temporary URL after the browser has had a beat
        // to dispatch the download.
        setTimeout(() => {
          URL.revokeObjectURL(a.href);
          a.remove();
        }, 1500);
      }, 'image/png');
    }

    return { takeSnapshot };
  })();

  // -------- 🧭 ODOMETRY ----------------------------------
  // Dead-reckoning navigator. Every time fireDrive() pushes new wheel
  // velocities (L, R), we update the integrator. An rAF tick integrates
  // the LAST known velocities over the elapsed dt to advance (x, y, θ).
  //
  // Differential drive kinematics (textbook):
  //   v = (vL + vR) / 2                forward velocity
  //   ω = (vL - vR) / wheelbase        angular velocity, CW positive
  //   ẋ = v · sin(θ)                   (θ = 0 means north / +y)
  //   ẏ = v · cos(θ)
  //   θ̇ = ω
  //
  // VEL_SCALE is approximate (BLE units 0..255 → cm/s). The drift is
  // genuine — battery droop, wheel slip, and lack of encoders all
  // contribute. That IS the lesson: this is why real robots add an
  // IMU + encoders + Kalman filter on top of dead-reckoning.
  const mqOdometry = (function () {
    const WHEELBASE = 9;            // cm — Maqueen Lite v4 between-wheel distance
    const VEL_SCALE = 25 / 200;     // cm/s per BLE unit (rough; speed=200 ≈ 25 cm/s)
    const MAX_TRAIL = 600;          // cap so old samples don't bloat SVG
    const TRAIL_MIN_DIST = 0.6;     // cm — only push a new trail point if we moved this much

    let x = 0, y = 0, theta = 0;    // pose, world frame (cm, cm, rad)
    let vL = 0, vR = 0;             // last-seen wheel velocities (BLE units)
    let lastT = 0;                  // last integration timestamp (ms)
    let totalDist = 0;              // cumulative |v| · dt (cm)
    const trail = [];               // [{x, y}, ...]
    let raf = null;
    let started = false;

    // ---- SLAM-lite: project sonar pings into world coordinates ----
    // Each obstacle = a sonar reading taken at known robot pose +
    // known servo angle, transformed into the world frame and dropped
    // onto the map. Persistent (caps at 400, FIFO drop), 25 s fade.
    //
    // Servo convention: angle 90° = sonar pointing along robot's heading
    // (forward). Angle 0° = pointing right of forward. Angle 180° = left.
    // (This matches typical Maqueen kit mounting; calibrate by changing
    // SERVO_FWD_ANGLE if your kit's zero is different.)
    const SERVO_FWD_ANGLE = 90;     // servo deg that = robot's forward
    const OBST_MAX = 400;
    const OBST_FADE_MS = 25000;
    let lastServoAngle = SERVO_FWD_ANGLE;
    let lastServoAt = 0;
    const obstacles = [];           // [{x, y, cm, t}, ...]

    function tick(now) {
      if (!started) return;
      if (lastT === 0) lastT = now;
      const dt = (now - lastT) / 1000;
      lastT = now;
      // Skip pathological dt (tab was hidden, or first frame after wake)
      if (dt > 0 && dt < 0.5) {
        const v = (vL + vR) / 2 * VEL_SCALE;
        const omega = (vL - vR) * VEL_SCALE / WHEELBASE;
        // Integrate (Euler is fine at 60 Hz — error is tiny)
        theta += omega * dt;
        x += v * Math.sin(theta) * dt;
        y += v * Math.cos(theta) * dt;
        // Normalize theta to [-π, π]
        while (theta >  Math.PI) theta -= 2 * Math.PI;
        while (theta < -Math.PI) theta += 2 * Math.PI;
        totalDist += Math.abs(v) * dt;
        // Throttle trail growth — only push when we've actually moved
        if (Math.abs(v) > 0.3) {
          if (trail.length === 0) {
            trail.push({ x, y });
          } else {
            const last = trail[trail.length - 1];
            if (Math.hypot(x - last.x, y - last.y) > TRAIL_MIN_DIST) {
              trail.push({ x, y });
              if (trail.length > MAX_TRAIL) trail.shift();
            }
          }
        }
      }
      render();
      raf = requestAnimationFrame(tick);
    }

    // Auto-scale so the trail fits the viewport. We pick the largest
    // |coordinate| of (current pose ∪ trail) and fit it to 90 SVG units.
    function computeScale() {
      let m = 30;   // floor: never zoom further in than 30 cm visible
      if (Math.abs(x) > m) m = Math.abs(x);
      if (Math.abs(y) > m) m = Math.abs(y);
      for (let i = 0; i < trail.length; i++) {
        if (Math.abs(trail[i].x) > m) m = Math.abs(trail[i].x);
        if (Math.abs(trail[i].y) > m) m = Math.abs(trail[i].y);
      }
      // Obstacles also get a vote — the map should fit them too,
      // otherwise close-range walls get clipped off-screen.
      for (let i = 0; i < obstacles.length; i++) {
        if (Math.abs(obstacles[i].x) > m) m = Math.abs(obstacles[i].x);
        if (Math.abs(obstacles[i].y) > m) m = Math.abs(obstacles[i].y);
      }
      // Active challenge target also votes — otherwise a fresh-loaded
      // square would auto-scale to just the (0,0) origin and be invisible.
      try {
        const target = mqChallenges.getTarget();
        if (target && target.points) {
          for (let i = 0; i < target.points.length; i++) {
            if (Math.abs(target.points[i].x) > m) m = Math.abs(target.points[i].x);
            if (Math.abs(target.points[i].y) > m) m = Math.abs(target.points[i].y);
          }
        }
      } catch {}
      return 90 / m;
    }

    // SLAM-lite projection: take a sonar reading at (servo_deg, cm)
    // and project it into world coordinates using the current robot pose.
    //
    //   robot at (x, y) facing theta (rad, 0=+y world)
    //   servo angle in robot frame = (servo - 90) deg, +CW (right of fwd)
    //   sonar bearing in world = theta + servo_offset_in_robot
    //   obstacle = robot_pos + cm * (sin(bearing), cos(bearing))
    function projectSonar(servoDeg, cm) {
      if (cm <= 0 || cm > 200) return;            // invalid / too far to be useful
      const offsetRad = (servoDeg - SERVO_FWD_ANGLE) * Math.PI / 180;
      const bearing = theta + offsetRad;
      const ox = x + cm * Math.sin(bearing);
      const oy = y + cm * Math.cos(bearing);
      obstacles.push({ x: ox, y: oy, cm, t: performance.now() });
      if (obstacles.length > OBST_MAX) obstacles.shift();
    }

    // Hooks fired from the existing setAngle / setDist plumbing.
    // Same signature as mqSweepRadar so callsites stay symmetric.
    function recordAngle(angle) {
      lastServoAngle = +angle;
      lastServoAt = performance.now();
    }
    function recordDistance(cm) {
      // Project only if servo angle is fresh enough — same 500 ms window
      // as the sweep radar uses, for the same reason: angle + distance
      // must come from roughly the same physical instant to be valid.
      if (performance.now() - lastServoAt > 500) return;
      projectSonar(lastServoAngle, cm);
    }

    function render() {
      const scale = computeScale();
      const now = performance.now();
      // Trail polyline: world (x, y) → SVG (x*scale, -y*scale)  (SVG y is down)
      const trailEl = document.getElementById('mqOdoTrail');
      if (trailEl) {
        if (trail.length < 2) {
          trailEl.setAttribute('points', '');
        } else {
          let pts = '';
          for (let i = 0; i < trail.length; i++) {
            pts += (trail[i].x * scale).toFixed(1) + ',' + (-trail[i].y * scale).toFixed(1) + ' ';
          }
          trailEl.setAttribute('points', pts);
        }
      }
      // Challenge target shape (dashed). Drawn in same coord space; scale
      // already factors in target points so it always fits the viewport.
      const targetEl = document.getElementById('mqOdoTarget');
      if (targetEl) {
        try {
          const target = mqChallenges.getTarget();
          if (target && target.points && target.points.length > 1) {
            let pts = '';
            for (let i = 0; i < target.points.length; i++) {
              pts += (target.points[i].x * scale).toFixed(1) + ',' + (-target.points[i].y * scale).toFixed(1) + ' ';
            }
            targetEl.setAttribute('points', pts);
          } else {
            targetEl.setAttribute('points', '');
          }
        } catch {}
      }
      // Score is throttled inside mqChallenges (~3 Hz). Cheap to call here.
      try { mqChallenges.maybeUpdateScore(trail); } catch {}
      // Obstacles: drop fully-faded, render rest with opacity = 1-age/FADE_MS.
      const obstLayer = document.getElementById('mqOdoObstacles');
      if (obstLayer) {
        while (obstacles.length && (now - obstacles[0].t) > OBST_FADE_MS) obstacles.shift();
        let svg = '';
        for (let i = 0; i < obstacles.length; i++) {
          const o = obstacles[i];
          const op = Math.max(0, 1 - (now - o.t) / OBST_FADE_MS);
          // Color by distance — close = red (danger), mid = amber, far = pale yellow
          const color = o.cm < 10 ? '#ef4444' : o.cm < 30 ? '#fbbf24' : '#fde68a';
          const r = o.cm < 10 ? 1.6 : 1.2;
          const sx = (o.x * scale).toFixed(1);
          const sy = (-o.y * scale).toFixed(1);
          svg += `<circle cx="${sx}" cy="${sy}" r="${r}" fill="${color}" opacity="${op.toFixed(2)}"/>`;
        }
        obstLayer.innerHTML = svg;
      }
      // Robot dot — at (x, y), rotated by θ (clockwise = positive in SVG-y-inverted frame)
      const robot = document.getElementById('mqOdoRobot');
      if (robot) {
        const sx = (x * scale).toFixed(1);
        const sy = (-y * scale).toFixed(1);
        const deg = (theta * 180 / Math.PI).toFixed(1);
        robot.setAttribute('transform', `translate(${sx} ${sy}) rotate(${deg})`);
      }
      // Compass needle — points to world-NORTH from the robot's frame.
      // World-north is θ=0; if robot has turned right by θ, the needle
      // (relative to robot) rotates LEFT by θ to keep pointing north.
      const compass = document.getElementById('mqOdoCompass');
      if (compass) {
        compass.setAttribute('transform', `rotate(${(-theta * 180 / Math.PI).toFixed(1)})`);
      }
      // Drive sub-tab mascot — keep it spinning to match the robot's
      // estimated heading. Same source of truth (odometry's theta) so
      // mini-map, world map, and mascot are always in lockstep.
      try { mqMascot.heading(theta); } catch {}
      // Dashboard — speed gauge (from totalDist delta), heading needle,
      // ODO/TRIP/PEAK/AVG. Reads our internal state so it stays in sync
      // with the integrator. ~60 Hz from this rAF loop.
      try { mqDashboard.recordPose(theta, totalDist); } catch {}
      // HUD numbers
      const hudH = document.getElementById('mqOdoHeading');
      const hudD = document.getElementById('mqOdoDistance');
      const hudP = document.getElementById('mqOdoPosition');
      const hudS = document.getElementById('mqOdoSpeed');
      const scaleEl = document.getElementById('mqOdoScale');
      if (hudH) {
        const deg = ((theta * 180 / Math.PI) % 360 + 360) % 360;
        hudH.textContent = deg.toFixed(0) + '°';
      }
      if (hudD) hudD.textContent = (totalDist / 100).toFixed(2) + ' m';
      if (hudP) hudP.textContent = x.toFixed(0) + ', ' + y.toFixed(0) + ' cm';
      if (hudS) {
        const v = Math.abs((vL + vR) / 2 * VEL_SCALE);
        hudS.textContent = v.toFixed(1) + ' cm/s';
      }
      if (scaleEl) {
        // Show the per-ring distance (the inner ring is at radius 25 SVG units)
        const ringCm = (25 / scale).toFixed(0);
        scaleEl.textContent = 'grid · ' + ringCm + ' cm';
      }
    }

    function update(L, R) { vL = +L; vR = +R; }

    function reset() {
      x = 0; y = 0; theta = 0; totalDist = 0;
      trail.length = 0;
      obstacles.length = 0;
      const obstLayer = document.getElementById('mqOdoObstacles');
      if (obstLayer) obstLayer.innerHTML = '';
      render();
    }

    function start() {
      if (started) return;
      started = true;
      lastT = 0;
      raf = requestAnimationFrame(tick);
    }

    // Read-only accessors for telemetry export — return shallow copies
    // so the caller can mutate freely without disturbing live state.
    function getTrail()     { return trail.map(p => ({ x: p.x, y: p.y })); }
    function getObstacles() { return obstacles.map(o => ({ x: o.x, y: o.y, cm: o.cm, t: o.t })); }
    function getPose()      { return { x, y, theta }; }
    function getTotalDist() { return totalDist; }

    return { update, recordAngle, recordDistance, reset, start,
             getTrail, getObstacles, getPose, getTotalDist };
  })();
  // Expose for cross-module read-only access (autopilot, slam-game,
  // math-distance, ar-overlay, mini-games / Echo Hunt). The IIFE's
  // const is otherwise unreachable; consumers only need accessors.
  window.mqOdometry = mqOdometry;

  // -------- 📡 SWEEP RADAR --------------------------------
  // The iconic Arduino + Processing sweep radar. Beam is anchored to the
  // LIVE S1 servo angle; red blips are REAL (servo angle, sonar distance)
  // pairs that persist and fade over 5 s. Pair with S1 Sweep mode for the
  // full effect — the beam tracks the actual servo, blips appear at the
  // actual ultrasonic readings, no fakery.
  const mqSweepRadar = (function () {
    let active = false;
    let raf = null;
    let lastAngle = 90;
    let lastAngleAt = 0;        // timestamp of last servo-angle update
    let lastCm = null;
    const blips = [];           // FIFO of {angle, cm, t}
    const MAX_BLIPS = 220;
    const FADE_MS = 5000;
    // 🎯 Marker render mode: 'dots' (original), 'sectors' (filled angular
    // wedges → polar occupancy histogram), 'rays' (thin bearing lines from
    // origin out to detection). Persisted so the user's choice survives.
    const MODE_KEY = 'maqueen.sweepMarker';
    let renderMode = 'dots';
    try { renderMode = localStorage.getItem(MODE_KEY) || 'dots'; } catch {}
    function setMode(m) {
      if (!m) m = 'dots';
      renderMode = m;
      try { localStorage.setItem(MODE_KEY, m); } catch {}
      // Repaint chip active state
      document.querySelectorAll('.mq-sweep-mode').forEach(b => {
        b.classList.toggle('mq-sweep-mode-active', b.dataset.mode === m);
      });
    }
    function getMode() { return renderMode; }

    // ---- Render helpers per mode ----
    // All take (now, blipColor) and return SVG markup string.
    // Each blip's age → opacity = 1 - age/FADE_MS.
    function renderDots(now, blipColor) {
      let svg = '';
      for (let i = 0; i < blips.length; i++) {
        const b = blips[i];
        const op = Math.max(0, 1 - (now - b.t) / FADE_MS);
        const r = distToRadius(b.cm);
        const p = polar(b.angle, r);
        const color = blipColor(b.cm);
        const radius = b.cm < 10 ? 2.4 : 2.0;
        svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${radius}" fill="${color}" opacity="${op.toFixed(2)}"/>`;
      }
      return svg;
    }
    // 'rays' — thin bearing line from origin (200, 200) out to the detection.
    // Cleaner than lines-from-everywhere: encodes the bearing explicitly.
    function renderRays(now, blipColor) {
      let svg = '';
      for (let i = 0; i < blips.length; i++) {
        const b = blips[i];
        const op = Math.max(0, 1 - (now - b.t) / FADE_MS);
        const r = distToRadius(b.cm);
        const p = polar(b.angle, r);
        const color = blipColor(b.cm);
        const w = b.cm < 10 ? 1.4 : 0.8;
        svg += `<line x1="200" y1="200" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="${color}" stroke-width="${w}" stroke-opacity="${op.toFixed(2)}" stroke-linecap="round"/>`;
      }
      return svg;
    }
    // ✦ STARS — 5-point star polygons at each detection point. Same
    // threshold colors, slightly larger than the dots so the points
    // read clearly. Playful + still readable as data.
    function renderStars(now, blipColor) {
      let svg = '';
      for (let i = 0; i < blips.length; i++) {
        const b = blips[i];
        const op = Math.max(0, 1 - (now - b.t) / FADE_MS);
        const r = distToRadius(b.cm);
        const p = polar(b.angle, r);
        const color = blipColor(b.cm);
        // Star size scales with proximity (close = bigger = louder)
        const R = b.cm < 10 ? 4.5 : b.cm < 30 ? 3.5 : 3.0;
        // 5-point star polygon: 10 vertices alternating outer R / inner r·0.4
        const cx = p.x, cy = p.y;
        const inner = R * 0.4;
        let pts = '';
        for (let v = 0; v < 10; v++) {
          const rad = v % 2 === 0 ? R : inner;
          const a = (v / 10) * 2 * Math.PI - Math.PI / 2;  // start at top
          const x = cx + rad * Math.cos(a);
          const y = cy + rad * Math.sin(a);
          pts += `${x.toFixed(1)},${y.toFixed(1)} `;
        }
        svg += `<polygon points="${pts}" fill="${color}" opacity="${op.toFixed(2)}"/>`;
      }
      return svg;
    }
    // 🌟 EMOJI — kid-friendly icons at detection points. Distance picks
    // the emoji: 💥 collision · ⚠️ warning · ✨ all clear. Threshold
    // story told entirely with universally-recognized symbols.
    function renderEmoji(now) {
      let svg = '';
      for (let i = 0; i < blips.length; i++) {
        const b = blips[i];
        const op = Math.max(0, 1 - (now - b.t) / FADE_MS);
        const r = distToRadius(b.cm);
        const p = polar(b.angle, r);
        const emoji = b.cm < 10 ? '💥' : b.cm < 30 ? '⚠️' : '✨';
        const size = b.cm < 10 ? 12 : b.cm < 30 ? 10 : 9;
        // <text> with text-anchor middle + dominant-baseline central
        // to keep the glyph centered on (p.x, p.y).
        svg += `<text x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" font-size="${size}" text-anchor="middle" dominant-baseline="central" opacity="${op.toFixed(2)}">${emoji}</text>`;
      }
      return svg;
    }
    // 'sectors' — bin blips into 6° angular slices, draw each as a filled
    // pie wedge from origin out to the bin's most-recent distance. Reads
    // as a polar occupancy grid: walls emerge as fat colored sectors,
    // openings as thin/missing ones.
    const SECTOR_DEG = 6;
    function renderSectors(now, blipColor) {
      // Bucket blips by angular bin; within a bin, keep the most recent.
      const bins = new Map();
      for (let i = 0; i < blips.length; i++) {
        const b = blips[i];
        const binId = Math.floor(b.angle / SECTOR_DEG);
        const cur = bins.get(binId);
        if (!cur || b.t > cur.t) bins.set(binId, { ...b, _binId: binId });
      }
      let svg = '';
      for (const [binId, b] of bins) {
        const op = Math.max(0, 1 - (now - b.t) / FADE_MS) * 0.55;   // 0.55 cap so grid stays visible
        const r  = distToRadius(b.cm);
        if (r <= 0) continue;
        const a1 = (binId * SECTOR_DEG) * Math.PI / 180;
        const a2 = ((binId + 1) * SECTOR_DEG) * Math.PI / 180;
        const x1 = 200 + r * Math.cos(a1), y1 = 200 - r * Math.sin(a1);
        const x2 = 200 + r * Math.cos(a2), y2 = 200 - r * Math.sin(a2);
        const color = blipColor(b.cm);
        // Pie slice: M origin → L outer1 → A radius radius 0 0 0 outer2 → Z
        // sweep-flag 0 because angles INCREASE clockwise in our (x,y) world,
        // but in SVG with y inverted that's actually a counter-clockwise arc.
        svg += `<path d="M 200 200 L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 0 ${x2.toFixed(1)} ${y2.toFixed(1)} Z" fill="${color}" fill-opacity="${op.toFixed(2)}" stroke="${color}" stroke-width="0.4" stroke-opacity="${(op + 0.15).toFixed(2)}"/>`;
      }
      return svg;
    }

    // Distance → SVG radius. Piecewise so close objects get more visual
    // space (closer = action zone). Matches the arc rings at 10/30/100 cm
    // → radii 40/80/160 in the SVG (origin 200,200; viewBox 400x220).
    function distToRadius(cm) {
      if (cm <= 0) return 0;
      if (cm < 10)  return (cm / 10) * 40;
      if (cm < 30)  return 40 + ((cm - 10) / 20) * 40;
      if (cm < 100) return 80 + ((cm - 30) / 70) * 80;
      return 160;
    }
    // Angle (deg, 0..180) → SVG (x, y). 0° = right, 90° = up, 180° = left.
    function polar(deg, r) {
      const rad = deg * Math.PI / 180;
      return { x: 200 + r * Math.cos(rad), y: 200 - r * Math.sin(rad) };
    }

    function recordAngle(angle) {
      lastAngle = angle;
      lastAngleAt = performance.now();
      const hint = document.getElementById('mqSweepHint');
      if (hint) hint.style.opacity = '0.35';
    }
    function recordDistance(cm) {
      lastCm = (cm > 0 && cm < 500) ? Math.round(+cm) : null;
      if (lastCm == null) return;
      // Only push a blip if the angle reading is fresh — otherwise the
      // (angle, dist) pair isn't meaningful. 500 ms window covers BLE RTT.
      if (performance.now() - lastAngleAt > 500) return;
      blips.push({ angle: lastAngle, cm: lastCm, t: performance.now() });
      if (blips.length > MAX_BLIPS) blips.shift();
      // 🌊 Animated ping wave — expanding circle from origin to the
      // current detection radius. Pure SVG; cancels any in-flight
      // animation by rewriting the stroke + radius. Visual heartbeat
      // that says 'fresh data just arrived'.
      try {
        const ping = document.getElementById('mqSweepPingFx');
        if (ping && lastCm != null) {
          // Map cm to SVG radius the same way the blip does:
          // 100 cm = 160 svg-units (the outer arc)
          const r = Math.min(160, lastCm * 1.6);
          ping.setAttribute('r', '0');
          ping.style.opacity = '0';
          ping.animate(
            [
              { r: 0,    opacity: 0.85, strokeWidth: 3 },
              { r: r,    opacity: 0,    strokeWidth: 0.5 },
            ],
            { duration: 600, easing: 'ease-out', fill: 'forwards' }
          );
        }
      } catch {}
    }

    function render() {
      if (!active) return;
      const now = performance.now();
      // Beam — SVG rotate is CW-positive; negate so 90° → straight up.
      const beam = document.getElementById('mqSweepBeamG');
      if (beam) beam.setAttribute('transform', `rotate(${-lastAngle} 200 200)`);
      // HUD
      const hudA = document.getElementById('mqSweepHudA');
      const hudD = document.getElementById('mqSweepHudD');
      if (hudA) hudA.textContent = Math.round(lastAngle) + ' deg';
      if (hudD) hudD.textContent = (lastCm == null ? '— cm' : lastCm + ' cm');
      // Blips — drop fully-faded first.
      while (blips.length && (now - blips[0].t) > FADE_MS) blips.shift();
      // Pick the active render mode — branch on persisted user choice.
      const dotsLayer    = document.getElementById('mqSweepBlips');
      const sectorsLayer = document.getElementById('mqSweepSectors');
      // Vibrant 4-tier threshold color spectrum — bolder than the
      // 3-tier red/amber/white, with cyan replacing the muted 'safe'
      // for at-a-glance recognition on the green sweep grid.
      const blipColor = (cm) =>
        cm < 10 ? '#ef4444'              // red   · obstacle
      : cm < 30 ? '#fbbf24'              // amber · close
      : cm < 60 ? '#84cc16'              // lime  · mid-safe
      :           '#22d3ee';             // cyan  · clear-far
      // Render-mode dispatch — clear unused layers each frame so toggling
      // between modes wipes the previous render cleanly.
      if (renderMode === 'sectors') {
        if (dotsLayer) dotsLayer.innerHTML = '';
        if (sectorsLayer) sectorsLayer.innerHTML = renderSectors(now, blipColor);
      } else if (renderMode === 'rays') {
        if (sectorsLayer) sectorsLayer.innerHTML = '';
        if (dotsLayer) dotsLayer.innerHTML = renderRays(now, blipColor);
      } else if (renderMode === 'stars') {
        if (sectorsLayer) sectorsLayer.innerHTML = '';
        if (dotsLayer) dotsLayer.innerHTML = renderStars(now, blipColor);
      } else if (renderMode === 'emoji') {
        if (sectorsLayer) sectorsLayer.innerHTML = '';
        if (dotsLayer) dotsLayer.innerHTML = renderEmoji(now);
      } else {
        // 'dots' (default) — original fading-circle blips.
        if (sectorsLayer) sectorsLayer.innerHTML = '';
        if (dotsLayer) dotsLayer.innerHTML = renderDots(now, blipColor);
      }
      // LOCK indicator — last 6 blips clustered near current (angle, dist)
      const lock = document.getElementById('mqSweepHudLock');
      if (lock) {
        let recent = 0;
        const tail = Math.min(blips.length, 6);
        if (tail >= 3 && lastCm != null) {
          for (let i = blips.length - tail; i < blips.length; i++) {
            const b = blips[i];
            if (Math.abs(b.angle - lastAngle) < 8 && Math.abs(b.cm - lastCm) < 3) recent++;
          }
        }
        if (recent >= 3) {
          lock.textContent = 'LOCK · ' + lastCm + ' cm';
          lock.style.opacity = '1';
        } else {
          lock.style.opacity = '0';
        }
      }
      raf = requestAnimationFrame(render);
    }

    function start() {
      if (active) return;
      active = true;
      raf = requestAnimationFrame(render);
    }
    function stop() {
      active = false;
      if (raf) { cancelAnimationFrame(raf); raf = null; }
    }
    return { recordAngle, recordDistance, start, stop, isActive: () => active, setMode, getMode };
  })();

  // -------- ULTRASONIC ------------------------------------
  let distAutoTimer = null;
  // Distance sparkline (last ~30 samples = ~30 sec at 1 Hz default)
  let distSpark = null;
  function ensureDistSpark() {
    if (distSpark) return distSpark;
    const path = document.getElementById('mqDistSpark');
    if (!path) return null;
    distSpark = makeSparkline(path, { max: 200, samples: 30 });
    return distSpark;
  }
  function setDist(cm) {
    cm = Math.round(+cm);
    const noSensor = (cm <= 0 || cm >= 500);
    // Sweep radar — feed every reading (incl. no-sensor → "— cm" in HUD).
    try { mqSweepRadar.recordDistance(cm); } catch {}
    // Odometry SLAM-lite — project (servo, dist) into the world map
    // when the angle reading is fresh. No-op for no-sensor / out-of-range.
    try { mqOdometry.recordDistance(cm); } catch {}
    // Big mascot — sonar antenna length + color + eye-widening alert.
    try { mqMascot.sonarDistance(cm); } catch {}
    // Dashboard — SONAR gauge needle (inverted: close = right) + the
    // collision warning light when cm < 10.
    try { mqDashboard.recordDistance(cm); } catch {}
    // Auto-wander — react to obstacles by turning. No-op when not active.
    try { mqWander.onDistance(cm); } catch {}
    // Sonar audio ping — tiny pip whose pitch/volume scale with cm.
    // Silent when toggle is off OR no echo / out of range.
    try { mqAudioPing.ping(cm); } catch {}
    // Glossy gauge — compatibility shims for the old IDs are still in DOM
    const big = document.getElementById('mqDistBig');
    const bar = document.getElementById('mqDistBar');
    const range = document.getElementById('mqDistRange');
    const arc = document.getElementById('mqDistGaugeArc');
    const num = document.getElementById('mqDistGaugeNum');
    const emoji = document.getElementById('mqDistEmoji');
    const sparkInfo = document.getElementById('mqDistSparkInfo');
    // Bat sonar elements
    const batBlip   = document.getElementById('mqBatBlip');
    const batNum    = document.getElementById('mqDistRadarNum');
    const batStatus = document.getElementById('mqDistRadarStatus');
    const batTof    = document.getElementById('mqDistTofMs');
    // Submarine-sonar readout elements (mirrors the Bat readout in green)
    const sonarNum    = document.getElementById('mqSonarNum');
    const sonarStatus = document.getElementById('mqSonarStatus');
    // LiDAR readout (cyan) + Heat readout (amber)
    const lidarNum    = document.getElementById('mqLidarNum');
    const lidarStatus = document.getElementById('mqLidarStatus');
    const heatNum     = document.getElementById('mqHeatNum');
    const heatStatus  = document.getElementById('mqHeatStatus');
    if (noSensor) {
      if (big) big.textContent = '— cm';
      if (num) { num.textContent = '— cm'; num.setAttribute('fill', '#93a8c4'); }
      if (emoji) emoji.textContent = '📡';
      if (arc) arc.setAttribute('stroke-dasharray', '0 100');
      if (range) range.textContent = 'no sensor / no echo';
      if (bar) bar.style.width = '0%';
      if (sparkInfo) sparkInfo.textContent = 'no echo';
      if (batBlip) batBlip.setAttribute('opacity', '0');
      if (batNum) batNum.textContent = '— cm';
      if (batStatus) { batStatus.textContent = 'listening...'; batStatus.style.color = '#93a8c4'; }
      if (batTof) batTof.textContent = '— ms';
      if (sonarNum) { sonarNum.textContent = '— cm'; sonarNum.style.color = '#86efac'; }
      if (sonarStatus) { sonarStatus.textContent = 'listening...'; sonarStatus.style.color = '#93a8c4'; }
      if (lidarNum) { lidarNum.textContent = '— cm'; lidarNum.style.color = '#7dd3fc'; }
      if (lidarStatus) { lidarStatus.textContent = 'scanning...'; lidarStatus.style.color = '#93a8c4'; }
      if (heatNum) { heatNum.textContent = '— cm'; heatNum.style.color = '#fbbf24'; }
      if (heatStatus) { heatStatus.textContent = 'cooling...'; heatStatus.style.color = '#93a8c4'; }
      return;
    }
    const color = cm < 10 ? '#f87171' : cm < 30 ? '#fbbf24' : '#4ade80';
    const emojiPick = cm < 10 ? '🚧' : cm < 30 ? '⚠️' : '📡';
    if (big) big.textContent = cm + ' cm';
    if (num) { num.textContent = cm + ' cm'; num.setAttribute('fill', color); }
    if (emoji) emoji.textContent = emojiPick;
    if (range) range.textContent = 'range 0–500 cm';
    // gauge arc: closer = MORE filled (because closer = "more alarm")
    // 0..200 cm clamped, then inverted: 0 cm → 100% fill, 200+ cm → 0% fill
    const closenessPct = Math.max(0, Math.min(100, 100 - (cm / 200) * 100));
    if (arc) arc.setAttribute('stroke-dasharray', `${closenessPct.toFixed(1)} 100`);
    if (bar) bar.style.width = (Math.max(0, Math.min(100, (cm / 200) * 100)) + '%');
    // Sparkline + last-value info
    const sp = ensureDistSpark();
    if (sp) sp.push(Math.min(200, cm));
    if (sparkInfo) sparkInfo.textContent = cm + ' cm';
    // ALL radar blips now adopt the THRESHOLD color (red/amber/green)
    // instead of the radar's theme color. Reinforces the legend +
    // makes detected objects stand out from the radar's base palette
    // (e.g. a green blip on the green sonar background was invisible).
    function paintBlip(group) {
      if (!group) return;
      group.querySelectorAll('circle').forEach(c => c.setAttribute('fill', color));
    }
    // Bat blip — position along the bat's central axis (x=100), y interpolates
    // 120 (at the bat) → 30 (at top edge) as cm grows 0..200
    if (batBlip) {
      const yPos = 120 - Math.min(1, cm / 200) * 90;
      batBlip.querySelectorAll('circle').forEach(c => c.setAttribute('cy', yPos.toFixed(1)));
      batBlip.setAttribute('opacity', '1');
      paintBlip(batBlip);
    }
    try { mqAnat.sonar(); } catch {}
    // Sonar blip — same Y mapping as bat
    const sonarBlip = document.getElementById('mqSonarBlip');
    if (sonarBlip) {
      const yPos = 120 - Math.min(1, cm / 200) * 90;
      sonarBlip.querySelectorAll('circle').forEach(c => c.setAttribute('cy', yPos.toFixed(1)));
      sonarBlip.setAttribute('opacity', '1');
      paintBlip(sonarBlip);
    }
    // LiDAR blip cluster — same Y mapping
    const lidarBlip = document.getElementById('mqLidarBlip');
    if (lidarBlip) {
      const yPos = 120 - Math.min(1, cm / 200) * 90;
      const dy = yPos - 60;
      lidarBlip.querySelectorAll('circle').forEach(c => {
        const baseCy = parseFloat(c.getAttribute('cy'));
        // Only shift if not already shifted (use data-base attr trick)
        if (!c.dataset.baseCy) c.dataset.baseCy = baseCy;
        c.setAttribute('cy', (parseFloat(c.dataset.baseCy) + dy).toFixed(1));
      });
      lidarBlip.setAttribute('opacity', '1');
      paintBlip(lidarBlip);
    }
    // Heatmap marker — log-ish position so 10/30/100/200 land near tick marks
    const heatMarker = document.getElementById('mqHeatMarker');
    if (heatMarker) {
      // Map cm → 0..100% with log-ish scale (so sub-30cm zone gets more space)
      let pct;
      if (cm <= 0) pct = 0;
      else if (cm < 10) pct = (cm / 10) * 18;
      else if (cm < 30) pct = 18 + ((cm - 10) / 20) * 12;
      else if (cm < 100) pct = 30 + ((cm - 30) / 70) * 25;
      else if (cm < 200) pct = 55 + ((cm - 100) / 100) * 45;
      else pct = 100;
      heatMarker.style.left = pct.toFixed(1) + '%';
    }
    if (batNum) {
      // Tick on real value change (not on the same value being re-pinged)
      if (batNum.textContent !== cm + ' cm') {
        batNum.classList.remove('mq-num-tick');
        void batNum.offsetWidth;
        batNum.classList.add('mq-num-tick');
      }
      batNum.textContent = cm + ' cm';
      batNum.style.color = color;
    }
    if (batStatus) {
      const msg = cm < 10 ? 'OBSTACLE!' : cm < 30 ? 'close...' : cm < 100 ? 'tracked' : 'far';
      batStatus.textContent = msg;
      batStatus.style.color = color;
    }
    // Submarine-sonar readout — same number, same color thresholds,
    // submarine-style status verbs.
    if (sonarNum) {
      if (sonarNum.textContent !== cm + ' cm') {
        sonarNum.classList.remove('mq-num-tick');
        void sonarNum.offsetWidth;
        sonarNum.classList.add('mq-num-tick');
      }
      sonarNum.textContent = cm + ' cm';
      sonarNum.style.color = color;
    }
    if (sonarStatus) {
      const msg = cm < 10 ? 'CONTACT!' : cm < 30 ? 'closing in' : cm < 100 ? 'pinged' : 'open water';
      sonarStatus.textContent = msg;
      sonarStatus.style.color = color;
    }
    // LiDAR readout — laser-scanner verbs ('class-1' vibe)
    if (lidarNum) {
      if (lidarNum.textContent !== cm + ' cm') {
        lidarNum.classList.remove('mq-num-tick');
        void lidarNum.offsetWidth;
        lidarNum.classList.add('mq-num-tick');
      }
      lidarNum.textContent = cm + ' cm';
      lidarNum.style.color = color;
    }
    if (lidarStatus) {
      const msg = cm < 10 ? 'BLOCKED' : cm < 30 ? 'point cloud near' : cm < 100 ? 'point cloud' : 'clear';
      lidarStatus.textContent = msg;
      lidarStatus.style.color = color;
    }
    // Heat readout — thermal-imaging style verbs
    if (heatNum) {
      if (heatNum.textContent !== cm + ' cm') {
        heatNum.classList.remove('mq-num-tick');
        void heatNum.offsetWidth;
        heatNum.classList.add('mq-num-tick');
      }
      heatNum.textContent = cm + ' cm';
      heatNum.style.color = color;
    }
    if (heatStatus) {
      const msg = cm < 10 ? 'HOT!' : cm < 30 ? 'warm' : cm < 100 ? 'mild' : 'cool';
      heatStatus.textContent = msg;
      heatStatus.style.color = color;
    }
    // Time of flight: t = 2 * d / 340 m/s.  d in cm → t in ms
    // = 2 * (cm/100) / 340 * 1000  =  cm / 17  ms
    if (batTof) batTof.textContent = (cm / 17).toFixed(2) + ' ms';
  }
  function pollDist() {
    if (window.bleScheduler && window.bleScheduler.isConnected()) {
      window.bleScheduler.send('DIST?').catch(() => {});
    }
  }
  let distRateMs = +(localStorage.getItem('maqueen.distRate') || 600);
  function maqueenTabActive() {
    const a = document.querySelector('.tab-btn.active');
    return a && a.getAttribute('data-page') === 'maqueen';
  }
  function restartDistAuto() {
    const auto = document.getElementById('mqDistAuto');
    if (distAutoTimer) { clearInterval(distAutoTimer); distAutoTimer = null; }
    // Only re-arm if Maqueen tab is active AND we're connected. Otherwise
    // initTabGate / the disconnected handler owns lifecycle.
    if (auto && auto.checked && maqueenTabActive()
        && window.bleScheduler && window.bleScheduler.isConnected()) {
      distAutoTimer = setInterval(pollDist, distRateMs);
    }
  }
  function refreshDistOrb() {
    const orb = document.getElementById('mqDistOrb');
    const auto = document.getElementById('mqDistAuto');
    if (!orb) return;
    if (!auto || !auto.checked) { setOrb(orb, '', 'paused'); return; }
    const conn = window.bleScheduler && window.bleScheduler.isConnected();
    if (!conn) { setOrb(orb, 'warn', 'no link'); return; }
    setOrb(orb, 'on', 'polling ' + distRateMs + 'ms');
  }
  // Radar style selector — toggle which visualization is shown.
  function initRadarStyleSelector() {
    const picks = document.querySelectorAll('.mq-radar-pick');
    const styles = document.querySelectorAll('.mq-radar-style');
    if (!picks.length) return;
    let active;
    try { active = localStorage.getItem('maqueen.radarStyle') || 'bat'; }
    catch { active = 'bat'; }
    function show(name) {
      styles.forEach(s => s.style.display = (s.dataset.style === name) ? '' : 'none');
      picks.forEach(p => {
        const on = p.dataset.style === name;
        p.classList.toggle('mq-radar-pick-active', on);
      });
      try { localStorage.setItem('maqueen.radarStyle', name); } catch {}
      // Mount/unmount the sweep-radar rAF loop only when its style is on
      // — saves frames and keeps blip array idle for the other 4 styles.
      try {
        if (name === 'sweep') mqSweepRadar.start();
        else mqSweepRadar.stop();
      } catch {}
    }
    picks.forEach(p => p.addEventListener('click', () => show(p.dataset.style)));
    show(active);
    // 🎯 Sweep marker style chips — apply persisted choice + wire clicks.
    try { mqSweepRadar.setMode(mqSweepRadar.getMode()); } catch {}
    document.querySelectorAll('.mq-sweep-mode').forEach(b => {
      b.addEventListener('click', () => {
        try { mqSweepRadar.setMode(b.dataset.mode); } catch {}
      });
    });
  }
  function initUltrasonic() {
    const ping = document.getElementById('mqDistPing');
    const auto = document.getElementById('mqDistAuto');
    const rate = document.getElementById('mqDistRate');
    const read = document.getElementById('mqDistRateRead');
    if (!ping) return;
    initRadarStyleSelector();
    ping.addEventListener('click', pollDist);
    auto.addEventListener('change', () => { restartDistAuto(); refreshDistOrb(); });
    if (rate) {
      rate.value = distRateMs;
      if (read) read.textContent = distRateMs + ' ms';
      rate.addEventListener('input', e => {
        distRateMs = +e.target.value;
        if (read) read.textContent = distRateMs + ' ms';
        try { localStorage.setItem('maqueen.distRate', String(distRateMs)); } catch {}
        restartDistAuto();
        refreshDistOrb();
      });
    }
    restartDistAuto();
    refreshDistOrb();
    // Re-evaluate on connect/disconnect transitions. Critical: also call
    // restartDistAuto() on 'connected' — the orb-only handler used to
    // paint 'polling 2000ms' without actually starting the interval, so
    // at startup no DIST? was ever sent (and the audio ping had nothing
    // to play because no setDist() ever fired).
    if (window.bleScheduler && window.bleScheduler.on) {
      window.bleScheduler.on('connected', () => {
        restartDistAuto();
        refreshDistOrb();
      });
      window.bleScheduler.on('disconnected', refreshDistOrb);
    }
    // Audio-ping toggle. Restore persisted state, wire change handler.
    // The change handler IS a user gesture, which is what unlocks Web
    // Audio under Chrome's autoplay policy — perfect timing.
    const audioChk = document.getElementById('mqDistAudio');
    if (audioChk) {
      audioChk.checked = mqAudioPing.isEnabled();
      audioChk.addEventListener('change', e => {
        mqAudioPing.setEnabled(e.target.checked);
      });
    }
  }

  // -------- IR REMOTE -------------------------------------
  const IR_NAMES_KEY = 'maqueen.ir.names';
  let irNames = {};
  let lastIRCode = null;
  let irHistory = [];
  function loadIRNames() {
    try { irNames = JSON.parse(localStorage.getItem(IR_NAMES_KEY) || '{}'); } catch { irNames = {}; }
  }
  function saveIRNames() {
    try { localStorage.setItem(IR_NAMES_KEY, JSON.stringify(irNames)); } catch {}
  }
  function setIR(code) {
    const big = document.getElementById('mqIRBig');
    const name = document.getElementById('mqIRName');
    const pulse = document.getElementById('mqIRPulse');
    if (!big) return;
    lastIRCode = code;
    big.textContent = code;
    name.textContent = irNames[code] ? '"' + irNames[code] + '"' : 'unmapped — click 🏷 to name it';
    // Glossy dome pulse — flash via background-color + .mq-on for ~600ms
    if (pulse) {
      setDomeOn(pulse, '#c084fc', true);
      setTimeout(() => setDomeOn(pulse, '#c084fc', false), 600);
    }
    try { mqAnat.ir(); } catch {}
    if (irHistory[irHistory.length - 1] !== code) {
      irHistory.push(code);
      if (irHistory.length > 5) irHistory.shift();
    }
    const hist = document.getElementById('mqIRHistory');
    if (hist) hist.textContent = irHistory.join(' · ');
  }
  function initIR() {
    const poll = document.getElementById('mqIRPoll');
    const nameBtn = document.getElementById('mqIRNameBtn');
    if (!poll) return;
    loadIRNames();
    poll.addEventListener('click', () => {
      if (window.bleScheduler) window.bleScheduler.send('IR?').catch(() => {});
    });
    nameBtn.addEventListener('click', () => {
      if (lastIRCode == null) {
        alert('Press a button on your IR remote first, then click 🏷 to name that code.');
        return;
      }
      const proposed = irNames[lastIRCode] || '';
      const newName = prompt(`Name for IR code ${lastIRCode}:`, proposed);
      if (newName != null && newName.trim()) {
        irNames[lastIRCode] = newName.trim();
        saveIRNames();
        setIR(lastIRCode);   // refresh display
      }
    });
  }

  // -------- LINE FOLLOW (auto-mode using P13/P14 line eyes) -----
  // Convention from pxt-maqueen: 0 = on black line, 1 = on white floor
  let lineState = { l: 1, r: 1 };
  let following = false;
  let followTimer = null;

  // Sparklines for L and R sensor history (last ~30 samples)
  let lineSparkL = null, lineSparkR = null;
  function ensureLineSparks() {
    if (lineSparkL && lineSparkR) return;
    const pL = document.getElementById('mqLineSparkL');
    const pR = document.getElementById('mqLineSparkR');
    if (pL) lineSparkL = makeSparkline(pL, { max: 1, samples: 30, h: 16 });
    if (pR) lineSparkR = makeSparkline(pR, { max: 1, samples: 30, h: 16 });
  }
  function setLineStateUI(l, r) {
    lineState.l = +l; lineState.r = +r;
    // Tiny badge inside the Line card's auto-mode block
    const el = document.getElementById('mqLineState');
    if (el) {
      const fmt = v => v == 0 ? '●' : '○';   // ● = on line (black)
      el.textContent = `L:${fmt(l)} R:${fmt(r)}`;
      el.style.color = (l == 0 || r == 0) ? '#fbbf24' : '#4ade80';
    }
    // Glossy eye domes — sensor reads 0 (= on black line) → glow yellow
    const eyeL = document.getElementById('mqLineEyeL');
    const eyeR = document.getElementById('mqLineEyeR');
    const valL = document.getElementById('mqLineLVal');
    const valR = document.getElementById('mqLineRVal');
    setDomeOn(eyeL, '#fbbf24', l == 0);
    setDomeOn(eyeR, '#fbbf24', r == 0);
    if (valL) valL.textContent = l;
    if (valR) valR.textContent = r;
    try { mqAnat.line(l, r); } catch {}
    // Sparkline: invert so the line goes UP when on black (more interesting)
    ensureLineSparks();
    if (lineSparkL) lineSparkL.push(l == 0 ? 1 : 0);
    if (lineSparkR) lineSparkR.push(r == 0 ? 1 : 0);
  }

  // -------- LINE SENSORS auto-poll + manual read button -----
  let lineAutoTimer = null;
  function pollLine() {
    if (window.bleScheduler && window.bleScheduler.isConnected()) {
      window.bleScheduler.send('LINE?').catch(() => {});
    }
  }
  let lineRateMs = +(localStorage.getItem('maqueen.lineRate') || 600);
  function restartLineAuto() {
    const auto = document.getElementById('mqLineAuto');
    if (lineAutoTimer) { clearInterval(lineAutoTimer); lineAutoTimer = null; }
    // Same gate as restartDistAuto — don't poll from inactive tabs or
    // when disconnected.
    if (auto && auto.checked && maqueenTabActive()
        && window.bleScheduler && window.bleScheduler.isConnected()) {
      lineAutoTimer = setInterval(pollLine, lineRateMs);
    }
  }
  function refreshLineOrb() {
    const orb = document.getElementById('mqLineOrb');
    const auto = document.getElementById('mqLineAuto');
    if (!orb) return;
    if (!auto || !auto.checked) { setOrb(orb, '', 'paused'); return; }
    const conn = window.bleScheduler && window.bleScheduler.isConnected();
    if (!conn) { setOrb(orb, 'warn', 'no link'); return; }
    setOrb(orb, 'on', 'polling ' + lineRateMs + 'ms');
  }
  function initLineCard() {
    const poll = document.getElementById('mqLinePoll');
    const auto = document.getElementById('mqLineAuto');
    const rate = document.getElementById('mqLineRate');
    const read = document.getElementById('mqLineRateRead');
    if (!poll) return;
    poll.addEventListener('click', pollLine);
    auto.addEventListener('change', () => { restartLineAuto(); refreshLineOrb(); });
    if (rate) {
      rate.value = lineRateMs;
      if (read) read.textContent = lineRateMs + ' ms';
      rate.addEventListener('input', e => {
        lineRateMs = +e.target.value;
        if (read) read.textContent = lineRateMs + ' ms';
        try { localStorage.setItem('maqueen.lineRate', String(lineRateMs)); } catch {}
        restartLineAuto();
        refreshLineOrb();
      });
    }
    restartLineAuto();
    refreshLineOrb();
    // Same fix as the Distance polling — actually restart the interval
    // on 'connected' (was only repainting the orb, leaving polling
    // off until the user toggled the auto checkbox manually).
    if (window.bleScheduler && window.bleScheduler.on) {
      window.bleScheduler.on('connected', () => {
        restartLineAuto();
        refreshLineOrb();
      });
      window.bleScheduler.on('disconnected', refreshLineOrb);
    }
  }

  function followTick() {
    if (!window.bleScheduler || !window.bleScheduler.isConnected()) return;
    // Poll line state for the next iteration
    window.bleScheduler.send('LINE?').catch(() => {});
    // Compute motors from CURRENT lineState (last reply)
    const base = speed;
    const turn = Math.round(base * 0.4);
    let L = base, R = base;
    if (lineState.l === 0 && lineState.r === 1) {
      // Left eye sees line — steer LEFT (slow left wheel)
      L = turn; R = base;
    } else if (lineState.l === 1 && lineState.r === 0) {
      // Right eye sees line — steer RIGHT (slow right wheel)
      L = base; R = turn;
    } else if (lineState.l === 0 && lineState.r === 0) {
      // Both on line — go straight (could also be intersection)
      L = base; R = base;
    } else {
      // Both off line — lost it, slow crawl forward
      L = Math.round(base * 0.5); R = Math.round(base * 0.5);
    }
    window.bleScheduler.send(`M:${L},${R}`, { coalesce: true }).catch(() => {});
    setLastVerb(`M:${L},${R}`);
  }

  let followRateMs = +(localStorage.getItem('maqueen.followRate') || 200);
  function startFollow() {
    if (following) return;
    if (!window.bleScheduler || !window.bleScheduler.isConnected()) {
      alert('Connect to the robot first.');
      return;
    }
    following = true;
    const btn = document.getElementById('mqFollowBtn');
    if (btn) {
      btn.textContent = '🔴 Stop following';
      btn.style.color = '#f87171';
      btn.style.borderColor = '#f87171';
    }
    followTimer = setInterval(followTick, followRateMs);
  }
  function initFollowRate() {
    const rate = document.getElementById('mqFollowRate');
    const read = document.getElementById('mqFollowRateRead');
    if (!rate) return;
    rate.value = followRateMs;
    if (read) read.textContent = followRateMs + ' ms';
    rate.addEventListener('input', e => {
      followRateMs = +e.target.value;
      if (read) read.textContent = followRateMs + ' ms';
      try { localStorage.setItem('maqueen.followRate', String(followRateMs)); } catch {}
      // If currently following, restart at new rate
      if (following && followTimer) {
        clearInterval(followTimer);
        followTimer = setInterval(followTick, followRateMs);
      }
    });
  }
  function stopFollow() {
    if (!following) return;
    following = false;
    if (followTimer) { clearInterval(followTimer); followTimer = null; }
    const btn = document.getElementById('mqFollowBtn');
    if (btn) {
      btn.textContent = '🟢 Follow line';
      btn.style.color = '#4ade80';
      btn.style.borderColor = '#4ade80';
    }
    if (window.bleScheduler && window.bleScheduler.isConnected()) {
      window.bleScheduler.send('STOP').catch(() => {});
    }
    setLastVerb('STOP');
    lastDir = null;
  }
  function initLineFollow() {
    const btn = document.getElementById('mqFollowBtn');
    if (!btn) return;
    btn.addEventListener('click', () => following ? stopFollow() : startFollow());
    // Stop following automatically on disconnect
    if (window.bleScheduler) {
      window.bleScheduler.on('disconnected', stopFollow);
    }
  }

  // ---- Register reply listeners eagerly (retry until scheduler exists) ----
  function attachReplyListeners() {
    if (!window.bleScheduler) {
      setTimeout(attachReplyListeners, 100);
      return;
    }
    window.bleScheduler.on('reply', ({ line }) => {
      if (!line) return;
      let m;
      if (line === 'DIST:-') {
        setDist(0); // no echo / out of range
      } else if ((m = line.match(/^DIST:(\d+(?:\.\d+)?)$/))) {
        setDist(m[1]);
      } else if ((m = line.match(/^IR:(\d+)$/)) && +m[1] > 0) {
        setIR(m[1]);
      } else if ((m = line.match(/^LINE:(\d+),(\d+)$/))) {
        setLineStateUI(m[1], m[2]);
      }
    });
    // On disconnect: kill every timer this module owns. Avoids the
    // "phantom poll" pattern where DIST?/LINE?/follow keep firing into
    // the void and are silently rejected by the scheduler.
    window.bleScheduler.on('disconnected', () => {
      if (distAutoTimer) { clearInterval(distAutoTimer); distAutoTimer = null; }
      if (lineAutoTimer) { clearInterval(lineAutoTimer); lineAutoTimer = null; }
      if (followTimer)   { clearInterval(followTimer);   followTimer = null; }
      if (following) {
        following = false;
        const btn = document.getElementById('mqFollowBtn');
        if (btn) {
          btn.textContent = '🟢 Follow line';
          btn.style.color = '#4ade80';
          btn.style.borderColor = '#4ade80';
        }
      }
    });
  }
  attachReplyListeners();

  // -------- MAQUEEN SUB-TAB STRIP ---------------------------
  // Each card on the Maqueen tab is a `.mq-sub-page`. The header strip
  // has `.mq-sub-btn[data-mq-target=...]` buttons. Showing one card at
  // a time is much less overwhelming than the previous all-cards grid.
  // Selection persists in localStorage so reloading returns to the same
  // card the user was on.
  function initMaqueenSubTabs() {
    const buttons = document.querySelectorAll('.mq-sub-btn');
    const pages = document.querySelectorAll('.mq-sub-page');
    if (!buttons.length || !pages.length) return;
    let active;
    try { active = localStorage.getItem('maqueen.subTab') || 'drive'; }
    catch { active = 'drive'; }
    const anatomyParts = document.querySelectorAll('#mqAnatomy .mq-anat-part');
    function show(target) {
      pages.forEach(p => p.classList.toggle('mq-sub-active', p.dataset.mqSub === target));
      buttons.forEach(b => b.classList.toggle('mq-active',     b.dataset.mqTarget === target));
      anatomyParts.forEach(g => g.classList.toggle('mq-anat-active', g.dataset.mqTarget === target));
      try { localStorage.setItem('maqueen.subTab', target); } catch {}
    }
    // Material-style click ripple — set CSS vars to the click point so
    // the ::after radial gradient blooms from where the user pressed.
    function ripple(e, btn) {
      const rect = btn.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      btn.style.setProperty('--rx', x + '%');
      btn.style.setProperty('--ry', y + '%');
      btn.classList.remove('mq-rippling');
      // Force reflow so the animation restarts on rapid clicks
      // eslint-disable-next-line no-unused-expressions
      void btn.offsetWidth;
      btn.classList.add('mq-rippling');
    }
    buttons.forEach(b => b.addEventListener('click', (e) => {
      ripple(e, b);
      show(b.dataset.mqTarget);
    }));
    // Click a part on the anatomy mini-map → switch to that sub-tab
    anatomyParts.forEach(g => g.addEventListener('click', () => show(g.dataset.mqTarget)));
    const valid = Array.from(pages).some(p => p.dataset.mqSub === active);
    show(valid ? active : 'drive');
  }

  // -------- init ------------------------------------------
  function init() {
    initMaqueenSubTabs();
    initDrive();
    initServos();
    initLEDs();
    initRGB();
    initBuzzer();
    initUltrasonic();
    initIR();
    initLineFollow();
    initFollowRate();
    initLineCard();
    initTabGate();
  }

  // -------- TAB GATE ----------------------------------------
  // Pause every auto-poll / follow timer whenever the user leaves the
  // Maqueen tab — the polls are useless on Controls/Sensors/etc and they
  // saturate the BLE channel. Resume on return so checkbox state is
  // preserved across tab switches.
  function initTabGate() {
    function isMaqueenActive() {
      const active = document.querySelector('.tab-btn.active');
      return active && active.getAttribute('data-page') === 'maqueen';
    }
    function pauseAll() {
      if (distAutoTimer) { clearInterval(distAutoTimer); distAutoTimer = null; }
      if (lineAutoTimer) { clearInterval(lineAutoTimer); lineAutoTimer = null; }
      if (followTimer)   { clearInterval(followTimer);   followTimer   = null; }
    }
    function resumeIfNeeded() {
      const distAuto = document.getElementById('mqDistAuto');
      const lineAuto = document.getElementById('mqLineAuto');
      if (distAuto && distAuto.checked && !distAutoTimer) {
        distAutoTimer = setInterval(pollDist, distRateMs);
      }
      if (lineAuto && lineAuto.checked && !lineAutoTimer) {
        lineAutoTimer = setInterval(pollLine, lineRateMs);
      }
      if (following && !followTimer) {
        followTimer = setInterval(followTick, followRateMs);
      }
    }
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        // small delay so .active flips first
        setTimeout(() => {
          if (isMaqueenActive()) resumeIfNeeded();
          else pauseAll();
        }, 30);
      });
    });
    // Initial state — if first tab isn't Maqueen, pause
    setTimeout(() => { if (!isMaqueenActive()) pauseAll(); }, 50);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
