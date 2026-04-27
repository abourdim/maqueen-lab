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
  function fireDrive(dataL, dataR) {
    if (dataL === 0 && dataR === 0) {
      send('STOP');
      lastDir = null;
      setLastVerb('STOP');
      return;
    }
    const ref = 200;
    const L = Math.round(dataL * (speed / ref));
    const R = Math.round(dataR * (speed / ref));
    send(`M:${L},${R}`);
    lastDir = { l: dataL, r: dataR };
    setLastVerb(`M:${L},${R}`);
  }
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
        document.getElementById('mqS1Slider').value = p.s1;
        document.getElementById('mqS2Slider').value = p.s2;
        document.getElementById('mqS1Readout').textContent = p.s1 + '°';
        document.getElementById('mqS2Readout').textContent = p.s2 + '°';
        send(`SRV:1,${p.s1}`);
        send(`SRV:2,${p.s2}`);
      });
      presetEl.appendChild(b);
    });
    try { localStorage.setItem('maqueen.kit', kitKey); } catch {}
  }

  function initServos() {
    const s1 = document.getElementById('mqS1Slider');
    const s2 = document.getElementById('mqS2Slider');
    if (!s1) return;
    const r1 = document.getElementById('mqS1Readout');
    const r2 = document.getElementById('mqS2Readout');
    s1.addEventListener('input', e => {
      r1.textContent = e.target.value + '°';
      sendCoalesced(`SRV:1,${e.target.value}`);
    });
    s2.addEventListener('input', e => {
      r2.textContent = e.target.value + '°';
      sendCoalesced(`SRV:2,${e.target.value}`);
    });
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

  // -------- init ------------------------------------------
  function init() {
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
