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

  function applyKit(kitKey) {
    const kit = KITS[kitKey] || KITS.base;
    currentKit = kitKey;
    updateAnatomyKit(kitKey);
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
      // Sweep radar tracks S1 only (that's the port the sonar is mounted on).
      try { if (port === 1) mqSweepRadar.recordAngle(angle); } catch {}
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

    // Sweep — uses scheduler.animate so it's properly rate-limited.
    // Reads sweepPeriodMs LIVE on each tick so the slider can adjust speed
    // mid-sweep without restarting. Update rate scales inversely too —
    // faster sweep → more frames per second so motion stays smooth.
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
        // Update rate: ~10 Hz for slow sweeps, ~20 Hz for very fast ones,
        // capped so the BLE scheduler doesn't drown.
        const hz = Math.min(20, Math.max(8, Math.round(20000 / sweepPeriodMs)));
        window.bleScheduler.animate(`servo-sweep-${port}`, t => {
          const phase = ((t % sweepPeriodMs) / sweepPeriodMs) * 2 * Math.PI;
          const a = Math.round(90 + Math.sin(phase) * 90);
          rotateDial(port, a);
          setBigReadout(port, a);
          const slider = port === 1 ? s1 : s2;
          const readout = port === 1 ? r1 : r2;
          if (slider) slider.value = a;
          if (readout) readout.textContent = a + '°';
          lastShown = { port, angle: a };
          updateServoScope(a);
          renderCode();
          return `SRV:${port},${a}`;
        }, hz);
      });
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
      if (m === '360') {
        // Rebuild slider as bipolar -100..+100, default 0 (stop)
        slider.min = '-100'; slider.max = '100'; slider.value = '0';
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
        // Restore positional defaults
        slider.min = '0'; slider.max = '180'; slider.value = '90';
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
    // SVG-based LED?
    const lens = el.querySelector && el.querySelector('[id^="mqLedLens"]');
    const halo = el.querySelector && el.querySelector('[id^="mqLedHalo"]');
    if (lens) {
      const side = el.id.endsWith('L') ? 'L' : 'R';
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
      // Blips — drop fully-faded, render rest with opacity = 1 - age/FADE_MS
      const layer = document.getElementById('mqSweepBlips');
      if (layer) {
        while (blips.length && (now - blips[0].t) > FADE_MS) blips.shift();
        let svg = '';
        for (let i = 0; i < blips.length; i++) {
          const b = blips[i];
          const op = Math.max(0, 1 - (now - b.t) / FADE_MS);
          const r = distToRadius(b.cm);
          const p = polar(b.angle, r);
          const color = b.cm < 10 ? '#ef4444' : b.cm < 30 ? '#fbbf24' : '#86efac';
          const radius = b.cm < 10 ? 2.4 : 2.0;
          svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${radius}" fill="${color}" opacity="${op.toFixed(2)}"/>`;
        }
        layer.innerHTML = svg;
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
    return { recordAngle, recordDistance, start, stop, isActive: () => active };
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
    // Bat blip — position along the bat's central axis (x=100), y interpolates
    // 120 (at the bat) → 30 (at top edge) as cm grows 0..200
    if (batBlip) {
      const yPos = 120 - Math.min(1, cm / 200) * 90;
      batBlip.querySelectorAll('circle').forEach(c => c.setAttribute('cy', yPos.toFixed(1)));
      batBlip.setAttribute('opacity', '1');
    }
    try { mqAnat.sonar(); } catch {}
    // Sonar blip — same Y mapping as bat
    const sonarBlip = document.getElementById('mqSonarBlip');
    if (sonarBlip) {
      const yPos = 120 - Math.min(1, cm / 200) * 90;
      sonarBlip.querySelectorAll('circle').forEach(c => c.setAttribute('cy', yPos.toFixed(1)));
      sonarBlip.setAttribute('opacity', '1');
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
    // Re-evaluate orb on connect/disconnect transitions
    if (window.bleScheduler && window.bleScheduler.on) {
      window.bleScheduler.on('connected',    refreshDistOrb);
      window.bleScheduler.on('disconnected', refreshDistOrb);
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
    if (window.bleScheduler && window.bleScheduler.on) {
      window.bleScheduler.on('connected',    refreshLineOrb);
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
