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
  function fireDrive(dataL, dataR, opts) {
    opts = opts || {};
    if (dataL === 0 && dataR === 0) {
      // STOP: don't coalesce — we want STOP to actually land.
      send('STOP');
      lastDir = null;
      _lastSentL = 0; _lastSentR = 0;
      setLastVerb('STOP');
      if (typeof updateMascot === 'function') updateMascot(0, 0);
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
  }
  // Stub overridden in initDriveJuice() once the SVG is on screen.
  let updateMascot = null;
  function initDrive() {
    const slider = document.getElementById('mqSpeedSlider');
    const readout = document.getElementById('mqSpeedReadout');
    if (!slider) return;
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
    document.addEventListener('keydown', (e) => {
      if (!driveSubtabActive() || isTyping()) return;
      const k = e.key.toLowerCase();
      if (k === ' ') {
        e.preventDefault();
        held.clear();
        fireDrive(0, 0);
        return;
      }
      const v = KEY[k];
      if (!v) return;
      e.preventDefault();
      if (held.has(k)) return;   // ignore key auto-repeat
      held.add(k);
      fireDrive(v[0], v[1], { coalesce: true });
    });
    document.addEventListener('keyup', (e) => {
      if (!driveSubtabActive()) return;
      const k = e.key.toLowerCase();
      if (!KEY[k]) return;
      held.delete(k);
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

  function applyKit(kitKey) {
    const kit = KITS[kitKey] || KITS.base;
    currentKit = kitKey;
    document.getElementById('mqServosKitName').textContent = `(${kit.name})`;
    document.getElementById('mqS1Label').textContent = kit.s1Label;
    document.getElementById('mqS2Label').textContent = kit.s2Label;
    const presetEl = document.getElementById('mqServoPresets');
    presetEl.innerHTML = '';
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
      renderCode();
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

    s1.addEventListener('input', e => setAngle(1, +e.target.value));
    s2.addEventListener('input', e => setAngle(2, +e.target.value));

    // Quick angle preset buttons (per-servo)
    document.querySelectorAll('.mq-servo-quick').forEach(b => {
      b.addEventListener('click', () => {
        setAngle(+b.dataset.port, +b.dataset.angle);
      });
    });

    // Sweep — uses scheduler.animate so it's properly rate-limited.
    const sweeping = { 1: false, 2: false };
    document.querySelectorAll('.mq-servo-sweep').forEach(b => {
      const port = +b.dataset.port;
      b.addEventListener('click', () => {
        if (!window.bleScheduler) return;
        if (sweeping[port]) {
          sweeping[port] = false;
          window.bleScheduler.stop(`servo-sweep-${port}`);
          b.textContent = '▶ Sweep';
          return;
        }
        sweeping[port] = true;
        b.textContent = '⏸ Stop';
        const start = performance.now();
        window.bleScheduler.animate(`servo-sweep-${port}`, t => {
          const phase = ((t % 2000) / 2000) * 2 * Math.PI;
          const a = Math.round(90 + Math.sin(phase) * 90);
          // Update visuals every frame
          rotateDial(port, a);
          setBigReadout(port, a);
          const slider = port === 1 ? s1 : s2;
          const readout = port === 1 ? r1 : r2;
          if (slider) slider.value = a;
          if (readout) readout.textContent = a + '°';
          lastShown = { port, angle: a };
          renderCode();
          return `SRV:${port},${a}`;
        }, 10);
      });
    });

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
    document.getElementById('mqKitPicker').addEventListener('change', e => applyKit(e.target.value));

    // Restore saved kit
    let saved = 'base';
    try { saved = localStorage.getItem('maqueen.kit') || 'base'; } catch {}
    document.getElementById('mqKitPicker').value = saved;
    applyKit(saved);
  }

  // -------- SIMPLE LEDS -----------------------------------
  function initLEDs() {
    const btns = document.querySelectorAll('.mq-led-btn');
    if (!btns.length) return;
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = btn.dataset.led;
        const next = btn.dataset.state === '0' ? '1' : '0';
        btn.dataset.state = next;
        const lr = idx === '0' ? 'L' : 'R';
        btn.textContent = `${lr}: ${next === '1' ? 'ON' : 'OFF'}`;
        btn.style.background = next === '1' ? '#facc15' : '#0a1628';
        btn.style.color = next === '1' ? '#0a1628' : '#facc15';
        send(`LED:${idx},${next}`);
      });
    });

    document.getElementById('mqLedAllOff').addEventListener('click', async () => {
      // Await each send so they serialize past the rate limit
      await send('LED:0,0');
      await send('LED:1,0');
      btns.forEach(b => {
        b.dataset.state = '0';
        const lr = b.dataset.led === '0' ? 'L' : 'R';
        b.textContent = `${lr}: OFF`;
        b.style.background = '#0a1628';
        b.style.color = '#facc15';
      });
    });

    document.getElementById('mqLedBlink').addEventListener('click', async () => {
      // Serialize each LED command — awaiting echo naturally spaces them
      // past the rate limit, so BOTH L and R toggle every cycle.
      for (let i = 0; i < 5; i++) {
        await send('LED:0,1');
        await send('LED:1,1');
        await new Promise(r => setTimeout(r, 200));
        await send('LED:0,0');
        await send('LED:1,0');
        await new Promise(r => setTimeout(r, 200));
      }
    });
  }

  // -------- 4× RGB ----------------------------------------
  let rainbowTimer = null;
  function initRGB() {
    const pickers = document.querySelectorAll('.mq-rgb-picker');
    if (!pickers.length) return;
    pickers.forEach(p => {
      p.addEventListener('input', e => {
        const i = e.target.dataset.i;
        const { r, g, b } = hexToRGB(e.target.value);
        sendCoalesced(`RGB:${i},${r},${g},${b}`);
      });
    });
    document.getElementById('mqRgbAllOff').addEventListener('click', () => {
      if (rainbowTimer) { clearInterval(rainbowTimer); rainbowTimer = null; }
      for (let i = 0; i < 4; i++) send(`RGB:${i},0,0,0`);
    });
    document.getElementById('mqRgbRainbow').addEventListener('click', () => {
      if (rainbowTimer) { clearInterval(rainbowTimer); rainbowTimer = null; return; }
      let phase = 0;
      rainbowTimer = setInterval(() => {
        for (let i = 0; i < 4; i++) {
          const hue = (phase + i * 90) % 360;
          const { r, g, b } = hslToRgb(hue, 100, 50);
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
    if (!freqEl) return;
    document.querySelectorAll('.mq-note').forEach(n => {
      n.addEventListener('click', () => {
        const f = +n.dataset.freq;
        freqEl.value = f;
        send(`BUZZ:${f},${msEl.value || 200}`);
      });
    });
    document.getElementById('mqBuzzPlay').addEventListener('click', () => {
      send(`BUZZ:${freqEl.value || 440},${msEl.value || 200}`);
    });
    document.getElementById('mqBuzzOff').addEventListener('click', () => send('BUZZ:0,0'));
  }

  // -------- ULTRASONIC ------------------------------------
  let distHistory = [];
  let distAutoTimer = null;
  function setDist(cm) {
    const big = document.getElementById('mqDistBig');
    const bar = document.getElementById('mqDistBar');
    const dot = document.getElementById('mqSonarDot');
    const range = document.getElementById('mqDistRange');
    if (!big) return;
    cm = Math.round(+cm);
    // pxt-maqueen returns its max-range value (500) when the SR04 isn't
    // wired in or doesn't echo. 0 = bad reading. Treat both as "no sensor".
    const noSensor = (cm <= 0 || cm >= 500);
    if (noSensor) {
      big.textContent = '— cm';
      big.style.color = '#93a8c4';
      if (range) range.textContent = 'no sensor / no echo';
      if (bar) bar.style.width = '0%';
      if (dot) { dot.setAttribute('cy', 20); dot.setAttribute('fill', '#1d3556'); }
      // don't pollute history with placeholders
      return;
    }
    big.textContent = cm + ' cm';
    big.style.color = cm < 10 ? '#f87171' : cm < 30 ? '#fbbf24' : '#4ade80';
    if (range) range.textContent = 'range 0–500 cm';
    // bar maps 0..200 cm to 0..100%
    const pct = Math.max(0, Math.min(100, (cm / 200) * 100));
    if (bar) bar.style.width = pct + '%';
    // sonar dot — map distance to position on the arc (closer = lower y)
    if (dot) {
      const ratio = Math.min(1, cm / 100);     // 0..100 cm maps to full arc height
      dot.setAttribute('cy', 50 - ratio * 30);   // 50 = near, 20 = far
      dot.setAttribute('fill', cm < 10 ? '#f87171' : cm < 30 ? '#fbbf24' : '#4ade80');
    }
    distHistory.push(cm);
    if (distHistory.length > 6) distHistory.shift();
    const hist = document.getElementById('mqDistHistory');
    if (hist) hist.textContent = distHistory.join(' → ') + ' cm';
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
  function initUltrasonic() {
    const ping = document.getElementById('mqDistPing');
    const auto = document.getElementById('mqDistAuto');
    const rate = document.getElementById('mqDistRate');
    const read = document.getElementById('mqDistRateRead');
    if (!ping) return;
    ping.addEventListener('click', pollDist);
    auto.addEventListener('change', restartDistAuto);
    if (rate) {
      rate.value = distRateMs;
      if (read) read.textContent = distRateMs + ' ms';
      rate.addEventListener('input', e => {
        distRateMs = +e.target.value;
        if (read) read.textContent = distRateMs + ' ms';
        try { localStorage.setItem('maqueen.distRate', String(distRateMs)); } catch {}
        restartDistAuto();
      });
    }
    restartDistAuto();
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
    // pulse glow
    if (pulse) {
      pulse.style.boxShadow = '0 0 16px #c084fc, 0 0 4px #c084fc inset';
      setTimeout(() => { pulse.style.boxShadow = 'none'; }, 350);
    }
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

  function setLineStateUI(l, r) {
    lineState.l = +l; lineState.r = +r;
    // Tiny badge in the Drive panel auto-modes section
    const el = document.getElementById('mqLineState');
    if (el) {
      const fmt = v => v == 0 ? '●' : '○';   // ● = on line (black)
      el.textContent = `L:${fmt(l)} R:${fmt(r)}`;
      el.style.color = (l == 0 || r == 0) ? '#fbbf24' : '#4ade80';
    }
    // Big eyes in the dedicated Line sensors card
    const eyeL = document.getElementById('mqLineEyeL');
    const eyeR = document.getElementById('mqLineEyeR');
    const valL = document.getElementById('mqLineLVal');
    const valR = document.getElementById('mqLineRVal');
    if (eyeL) {
      // 0 = on black line  -> bright glow
      // 1 = off line       -> dim
      const onL = (l == 0);
      eyeL.style.background = onL ? '#fbbf24' : '#1d3556';
      eyeL.style.boxShadow = onL ? '0 0 16px #fbbf24' : 'none';
      eyeL.style.borderColor = onL ? '#fbbf24' : '#4ade80';
    }
    if (eyeR) {
      const onR = (r == 0);
      eyeR.style.background = onR ? '#fbbf24' : '#1d3556';
      eyeR.style.boxShadow = onR ? '0 0 16px #fbbf24' : 'none';
      eyeR.style.borderColor = onR ? '#fbbf24' : '#4ade80';
    }
    if (valL) valL.textContent = l;
    if (valR) valR.textContent = r;
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
  function initLineCard() {
    const poll = document.getElementById('mqLinePoll');
    const auto = document.getElementById('mqLineAuto');
    const rate = document.getElementById('mqLineRate');
    const read = document.getElementById('mqLineRateRead');
    if (!poll) return;
    poll.addEventListener('click', pollLine);
    auto.addEventListener('change', restartLineAuto);
    if (rate) {
      rate.value = lineRateMs;
      if (read) read.textContent = lineRateMs + ' ms';
      rate.addEventListener('input', e => {
        lineRateMs = +e.target.value;
        if (read) read.textContent = lineRateMs + ' ms';
        try { localStorage.setItem('maqueen.lineRate', String(lineRateMs)); } catch {}
        restartLineAuto();
      });
    }
    restartLineAuto();
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
    function show(target) {
      pages.forEach(p => p.classList.toggle('mq-sub-active', p.dataset.mqSub === target));
      buttons.forEach(b => b.classList.toggle('mq-active',     b.dataset.mqTarget === target));
      try { localStorage.setItem('maqueen.subTab', target); } catch {}
    }
    buttons.forEach(b => b.addEventListener('click', () => show(b.dataset.mqTarget)));
    // If saved target doesn't exist (e.g. card was removed), fall back to drive.
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
