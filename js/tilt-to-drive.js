// ============================================================
// tilt-to-drive.js — Phone tilt → robot motion (DeviceOrientation).
//
// Hold the phone like a steering wheel:
//   • beta  (front-back tilt) → throttle. Tilt forward = forward.
//   • gamma (left-right tilt)  → differential. Tilt right = turn right.
//
// We sample at the browser's native DeviceOrientation cadence
// (~60 Hz) and pipe through bleScheduler.coalesce so we never
// spam the queue. A deadzone around the calibrated center kills
// twitch when the phone is held loosely.
//
// iOS 13+ gates motion sensors behind a user gesture
// (DeviceMotionEvent.requestPermission). We surface that
// transparently — the toggle's first click triggers the prompt.
//
// Toggle lives in the Drive macro bar next to the voice button.
// ============================================================
(function () {
  'use strict';

  const KEY_ENABLED = 'maqueen.tiltEnabled';
  // Tilt magnitudes that map to FULL throttle / FULL turn. Anything
  // beyond is clamped. Values in degrees, tuned for natural arm tilt.
  const FULL_PITCH = 30;        // forward/back lean
  const FULL_ROLL  = 30;        // left/right lean
  const DEADZONE   = 4;         // degrees of slack near center
  const SEND_HZ    = 12;        // throttle output rate (BLE-friendly)

  let supported = ('DeviceOrientationEvent' in window);
  let on = false;
  let calibBeta  = 0;
  let calibGamma = 0;
  let lastSendT  = 0;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function applyTilt(beta, gamma) {
    if (beta == null || gamma == null) return;
    // Deltas from calibration center.
    let dPitch = beta  - calibBeta;
    let dRoll  = gamma - calibGamma;
    // Deadzone — flatten micro-tilt to exact zero so the robot can sit still.
    if (Math.abs(dPitch) < DEADZONE) dPitch = 0;
    if (Math.abs(dRoll)  < DEADZONE) dRoll  = 0;
    // Normalize to [-1, 1].
    const throttle = clamp(dPitch / FULL_PITCH, -1, 1);
    const turn     = clamp(dRoll  / FULL_ROLL,  -1, 1);
    // Differential drive mix:
    //   forward base = throttle, steering subtracts/adds to each side.
    // Convention: tilt right (+gamma) → spin right → left wheel faster.
    const base = throttle;
    const L = clamp(base + turn, -1, 1);
    const R = clamp(base - turn, -1, 1);
    // Scale to BLE M: range. The scheduler-side speed slider then
    // scales again — so this is "what fraction of slider speed".
    const ref = 200;
    sendMotors(Math.round(L * ref), Math.round(R * ref));
  }

  function sendMotors(L, R) {
    const now = performance.now();
    if (now - lastSendT < 1000 / SEND_HZ) return;
    lastSendT = now;
    // STOP path — when both sides are zero, send a real STOP so the
    // motor driver actually brakes rather than holding the last PWM.
    try {
      if (window.bleScheduler) {
        if (L === 0 && R === 0) {
          window.bleScheduler.send('STOP', { coalesce: true }).catch(() => {});
        } else {
          // Bake the speed slider in so this respects the user's cap.
          const slider = document.getElementById('mqSpeedSlider');
          const speed = slider ? +slider.value : 200;
          const sL = Math.round(L * (speed / 200));
          const sR = Math.round(R * (speed / 200));
          window.bleScheduler.send(`M:${sL},${sR}`, { coalesce: true }).catch(() => {});
        }
      }
    } catch {}
  }

  function onOrient(e) {
    if (!on) return;
    applyTilt(e.beta, e.gamma);
  }

  function calibrate() {
    // Snap calibration to whatever the phone reports right now —
    // intent: the kid holds the phone in their natural rest pose
    // and that pose becomes "stop". One-shot listener.
    return new Promise((resolve) => {
      function once(e) {
        calibBeta  = e.beta  || 0;
        calibGamma = e.gamma || 0;
        window.removeEventListener('deviceorientation', once);
        resolve();
      }
      window.addEventListener('deviceorientation', once, { once: true });
      // Safety: if no event fires within 1.5 s (sensor truly absent),
      // proceed with zeros and let the user re-calibrate manually.
      setTimeout(() => {
        window.removeEventListener('deviceorientation', once);
        resolve();
      }, 1500);
    });
  }

  async function start() {
    if (!supported) return;
    // iOS 13+ permission gate.
    try {
      if (typeof DeviceMotionEvent !== 'undefined' &&
          typeof DeviceMotionEvent.requestPermission === 'function') {
        const res = await DeviceMotionEvent.requestPermission();
        if (res !== 'granted') { paint('denied'); return; }
      }
    } catch {}
    on = true;
    try { localStorage.setItem(KEY_ENABLED, '1'); } catch {}
    await calibrate();
    window.addEventListener('deviceorientation', onOrient);
    paint('on');
  }

  function stop() {
    on = false;
    try { localStorage.setItem(KEY_ENABLED, '0'); } catch {}
    window.removeEventListener('deviceorientation', onOrient);
    // One last STOP so the robot doesn't keep coasting.
    sendMotors(0, 0);
    paint('off');
  }

  let btn;
  function paint(state) {
    if (!btn) return;
    if (state === 'denied') {
      btn.textContent = '📱 ❌';
      btn.title = 'Motion permission denied — enable in Settings → Safari → Motion & Orientation Access.';
      btn.classList.remove('mq-tilt-on');
      return;
    }
    btn.classList.toggle('mq-tilt-on', state === 'on');
    btn.textContent = state === 'on' ? '📱 ON' : '📱 tilt';
    btn.title = state === 'on'
      ? 'Tilt the phone to drive. Click to disable.'
      : 'Tilt-to-drive: click and tilt your phone like a steering wheel.';
  }

  function inject() {
    const macroBar = document.querySelector('.mq-macro-bar');
    if (!macroBar) return false;
    if (document.getElementById('mqTiltBtn')) return true;
    btn = document.createElement('button');
    btn.id = 'mqTiltBtn';
    btn.type = 'button';
    btn.className = 'mq-macro-btn mq-tilt-btn';
    if (!supported) {
      btn.disabled = true;
      btn.textContent = '📱 N/A';
      btn.title = 'Tilt-to-drive needs a phone or tablet with motion sensors.';
      macroBar.appendChild(btn);
      return true;
    }
    btn.addEventListener('click', () => on ? stop() : start());
    macroBar.appendChild(btn);
    paint('off');
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

  window.mqTilt = { start, stop, isOn: () => on };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
