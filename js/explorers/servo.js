// ============================================================
// servo.js — Servo Explorer (pilot component for Maqueen Lab)
//
// Wires the Servo Explorer DOM to the BLE scheduler.
// Visual: SVG horn rotates to match commanded angle.
// Calibration: per-port min/max saved to localStorage.
// Sweep: animated back-and-forth at user-set speed via scheduler.animate
// Code panel: live-updates the maqueen.* line + raw I2C equivalent
// ============================================================

(function () {
  'use strict';

  const STORAGE_KEY = 'maqueen.servo.calibration';

  // ----- state -----
  let activePort = 1;            // 1 = S1, 2 = S2
  let currentAngle = 90;
  let calibration = loadCalibration();   // { 1: {min, max}, 2: {min, max} }

  // ----- DOM refs (resolved on init) -----
  let horn, ghost, slider, angleReadout, codeLib, codeRaw;
  let sweepBtn, sweeping = false;
  let portRadios, minInput, maxInput;
  let presetBtns;

  function loadCalibration() {
    try {
      const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        1: { min: v[1]?.min ?? 0, max: v[1]?.max ?? 180 },
        2: { min: v[2]?.min ?? 0, max: v[2]?.max ?? 180 },
      };
    } catch { return { 1: { min: 0, max: 180 }, 2: { min: 0, max: 180 } }; }
  }
  function saveCalibration() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(calibration));
  }

  // ----- send angle to robot via scheduler -----
  function sendAngle(angle) {
    const cal = calibration[activePort];
    const clamped = Math.max(cal.min, Math.min(cal.max, Math.round(angle)));
    currentAngle = clamped;
    updateVisual(clamped);
    updateCode(clamped);
    if (window.bleScheduler) {
      window.bleScheduler.send(`SRV:${activePort},${clamped}`, { coalesce: true })
        .then(({ latency }) => flashCodeStatus('ok', latency))
        .catch(err => flashCodeStatus('err', err.message));
    }
  }

  // ----- visual: rotate horn -----
  function updateVisual(angle) {
    if (!horn) return;
    // Map 0–180 → -90..+90 deg for the SVG horn
    const rot = angle - 90;
    horn.setAttribute('transform', `rotate(${rot} 100 100)`);
    if (ghost) ghost.setAttribute('transform', `rotate(${rot} 100 100)`);
    if (angleReadout) angleReadout.textContent = `${angle}°`;
    if (slider && +slider.value !== angle) slider.value = angle;
  }

  function updateCode(angle) {
    if (codeLib) {
      codeLib.innerHTML =
        `maqueen.servoRun(maqueen.Servos.S${activePort}, <em>${angle}</em>)`;
    }
    if (codeRaw) {
      const reg = activePort === 1 ? '0x14' : '0x15';
      codeRaw.innerHTML =
        `let buf = pins.createBuffer(2)\n` +
        `buf[0] = ${reg}\n` +
        `buf[1] = <em>${angle}</em>\n` +
        `pins.i2cWriteBuffer(0x10, buf)`;
    }
  }

  function flashCodeStatus(kind, info) {
    const el = document.getElementById('servo-code-status');
    if (!el) return;
    el.textContent = kind === 'ok'
      ? `✓ echo ${Math.round(info)}ms`
      : `✗ ${info}`;
    el.className = `code-status ${kind === 'ok' ? 'status-ok' : 'status-err'}`;
    setTimeout(() => { el.classList.remove('flash'); }, 350);
    el.classList.add('flash');
  }

  // ----- sweep -----
  function startSweep(hz) {
    if (sweeping) return;
    sweeping = true;
    sweepBtn && (sweepBtn.textContent = '⏸ Stop sweep');
    const cal = calibration[activePort];
    const start = performance.now();
    const periodMs = 2000;   // 2-second cycle
    if (window.bleScheduler) {
      window.bleScheduler.animate('servo-sweep', t => {
        const phase = ((t % periodMs) / periodMs) * 2 * Math.PI;
        const a = Math.round(cal.min + (cal.max - cal.min) * (Math.sin(phase) * 0.5 + 0.5));
        currentAngle = a;
        updateVisual(a);
        updateCode(a);
        return `SRV:${activePort},${a}`;
      }, hz || 10);
    }
  }
  function stopSweep() {
    if (!sweeping) return;
    sweeping = false;
    sweepBtn && (sweepBtn.textContent = '▶ Sweep');
    if (window.bleScheduler) window.bleScheduler.stop('servo-sweep');
  }

  // ----- 2-second auto-demo on first contact -----
  function autoDemo() {
    if (localStorage.getItem('maqueen.servo.demoSeen')) return;
    localStorage.setItem('maqueen.servo.demoSeen', '1');
    let t0 = performance.now();
    const demoTimer = setInterval(() => {
      const t = (performance.now() - t0) / 1000;
      if (t > 2) { clearInterval(demoTimer); sendAngle(90); return; }
      const a = 90 + Math.sin(t * Math.PI * 2) * 60;
      updateVisual(Math.round(a));
    }, 50);
  }

  // ----- init -----
  function init() {
    horn = document.getElementById('servo-horn');
    ghost = document.getElementById('servo-ghost');
    slider = document.getElementById('servo-slider');
    angleReadout = document.getElementById('servo-readout');
    codeLib = document.getElementById('servo-code-lib');
    codeRaw = document.getElementById('servo-code-raw');
    sweepBtn = document.getElementById('servo-sweep-btn');
    portRadios = document.querySelectorAll('input[name="servo-port"]');
    minInput = document.getElementById('servo-min');
    maxInput = document.getElementById('servo-max');
    presetBtns = document.querySelectorAll('.servo-preset');

    if (!slider) return;   // not on this page

    slider.addEventListener('input', e => sendAngle(+e.target.value));

    portRadios.forEach(r => r.addEventListener('change', e => {
      activePort = +e.target.value;
      const cal = calibration[activePort];
      minInput.value = cal.min;
      maxInput.value = cal.max;
      sendAngle(currentAngle);
    }));

    minInput.addEventListener('change', e => {
      calibration[activePort].min = Math.max(0, Math.min(180, +e.target.value));
      saveCalibration();
    });
    maxInput.addEventListener('change', e => {
      calibration[activePort].max = Math.max(0, Math.min(180, +e.target.value));
      saveCalibration();
    });

    presetBtns.forEach(b => b.addEventListener('click', () => {
      sendAngle(+b.dataset.angle);
    }));

    sweepBtn.addEventListener('click', () => sweeping ? stopSweep() : startSweep(10));

    // Initial state
    minInput.value = calibration[1].min;
    maxInput.value = calibration[1].max;
    updateVisual(90);
    updateCode(90);
    autoDemo();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
