// ============================================================
// maqueen-tab.js — wires every control on the Maqueen tab
//
// All sends go through window.bleScheduler (sequence + echo).
// Reads stay live via the panel strip up top (maqueen-panel.js).
// ============================================================

(function () {
  'use strict';

  // -------- helpers ---------------------------------------
  const send = (verb) => {
    if (!window.bleScheduler) {
      console.warn('[maqueen-tab] no scheduler', verb);
      return;
    }
    window.bleScheduler.send(verb).catch(err => {
      console.warn('[maqueen-tab]', verb, err.message);
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
  function initDrive() {
    const slider = document.getElementById('mqSpeedSlider');
    const readout = document.getElementById('mqSpeedReadout');
    if (!slider) return;
    slider.addEventListener('input', e => {
      speed = +e.target.value;
      readout.textContent = speed;
    });
    document.querySelectorAll('.mq-drive-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.stop === '1') { send('STOP'); return; }
        // Scale data-l/data-r by current speed (treat 200 as nominal)
        const ref = 200;
        const L = Math.round(+btn.dataset.l * (speed / ref));
        const R = Math.round(+btn.dataset.r * (speed / ref));
        send(`M:${L},${R}`);
      });
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

    document.getElementById('mqLedAllOff').addEventListener('click', () => {
      send('LED:0,0');
      send('LED:1,0');
      btns.forEach(b => {
        b.dataset.state = '0';
        const lr = b.dataset.led === '0' ? 'L' : 'R';
        b.textContent = `${lr}: OFF`;
        b.style.background = '#0a1628';
        b.style.color = '#facc15';
      });
    });

    document.getElementById('mqLedBlink').addEventListener('click', async () => {
      for (let i = 0; i < 5; i++) {
        send('LED:0,1'); send('LED:1,1');
        await new Promise(r => setTimeout(r, 200));
        send('LED:0,0'); send('LED:1,0');
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

  // -------- init ------------------------------------------
  function init() {
    initDrive();
    initServos();
    initLEDs();
    initRGB();
    initBuzzer();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
