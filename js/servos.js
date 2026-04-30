// ============================================================
// servos.js — Servo controls wiring, gauges, trim
// ============================================================

(function(){
  const s1Range = document.getElementById('servo1Angle');
  const s1Num   = document.getElementById('servo1Number');
  const s1Send  = document.getElementById('servo1Send');
  const s1Off   = document.getElementById('servo1Off');

  const s2Range = document.getElementById('servo2Angle');
  const s2Num   = document.getElementById('servo2Number');
  const s2Send  = document.getElementById('servo2Send');
  const s2Off   = document.getElementById('servo2Off');

  // ==================== SERVO TRIM ====================
  let servo1Trim = 0;
  let servo2Trim = 0;

  // Restore from localStorage
  try {
      servo1Trim = parseInt(localStorage.getItem('mb_servo1_trim'), 10) || 0;
      servo2Trim = parseInt(localStorage.getItem('mb_servo2_trim'), 10) || 0;
  } catch {}

  function applyTrim(angle, trim) {
      return Math.min(180, Math.max(0, angle + trim));
  }

  // Trim UI
  const s1TrimSlider = document.getElementById('servo1Trim');
  const s1TrimVal = document.getElementById('servo1TrimVal');
  const s1TrimReset = document.getElementById('servo1TrimReset');
  const s2TrimSlider = document.getElementById('servo2Trim');
  const s2TrimVal = document.getElementById('servo2TrimVal');
  const s2TrimReset = document.getElementById('servo2TrimReset');

  if (s1TrimSlider) {
      s1TrimSlider.value = servo1Trim;
      if (s1TrimVal) s1TrimVal.textContent = (servo1Trim >= 0 ? '+' : '') + servo1Trim + '°';
      s1TrimSlider.addEventListener('input', () => {
          servo1Trim = parseInt(s1TrimSlider.value, 10);
          if (s1TrimVal) s1TrimVal.textContent = (servo1Trim >= 0 ? '+' : '') + servo1Trim + '°';
          try { localStorage.setItem('mb_servo1_trim', servo1Trim); } catch {}
      });
  }
  if (s1TrimReset) {
      s1TrimReset.addEventListener('click', () => {
          servo1Trim = 0;
          if (s1TrimSlider) s1TrimSlider.value = 0;
          if (s1TrimVal) s1TrimVal.textContent = '0°';
          try { localStorage.setItem('mb_servo1_trim', 0); } catch {}
      });
  }

  if (s2TrimSlider) {
      s2TrimSlider.value = servo2Trim;
      if (s2TrimVal) s2TrimVal.textContent = (servo2Trim >= 0 ? '+' : '') + servo2Trim + '°';
      s2TrimSlider.addEventListener('input', () => {
          servo2Trim = parseInt(s2TrimSlider.value, 10);
          if (s2TrimVal) s2TrimVal.textContent = (servo2Trim >= 0 ? '+' : '') + servo2Trim + '°';
          try { localStorage.setItem('mb_servo2_trim', servo2Trim); } catch {}
      });
  }
  if (s2TrimReset) {
      s2TrimReset.addEventListener('click', () => {
          servo2Trim = 0;
          if (s2TrimSlider) s2TrimSlider.value = 0;
          if (s2TrimVal) s2TrimVal.textContent = '0°';
          try { localStorage.setItem('mb_servo2_trim', 0); } catch {}
      });
  }

  function syncRangeNumber(range, num) {
    if (!range || !num) return;
    range.addEventListener('input', () => { num.value = range.value; });
    num.addEventListener('change', () => {
      let v = parseInt(num.value, 10);
      if (Number.isNaN(v)) v = 0;
      if (v < 0) v = 0;
      if (v > 180) v = 180;
      num.value = v;
      range.value = v;
    });
  }

  syncRangeNumber(s1Range, s1Num);
  syncRangeNumber(s2Range, s2Num);

  // ARIA labels for servo sliders (Fix 13)
  if (s1Range) s1Range.setAttribute('aria-label', 'Servo 1 angle (0–180°)');
  if (s2Range) s2Range.setAttribute('aria-label', 'Servo 2 angle (0–180°)');

  s1Send && s1Send.addEventListener('click', () => {
    const raw = Math.min(180, Math.max(0, parseInt(s1Num.value || 0, 10)));
    const v = applyTrim(raw, servo1Trim);
    if (typeof writeUART === 'function') writeUART('SERVO1:' + v);
    if (typeof board3dUpdate === 'function') board3dUpdate('servo1', v);
    if (typeof addActivity === 'function') addActivity('⚙️ Motor 1 → ' + raw + '°' + (servo1Trim ? ' (trim ' + (servo1Trim>0?'+':'') + servo1Trim + '° = ' + v + '°)' : ''), 'sent');
  });
  s1Off && s1Off.addEventListener('click', () => {
    if (typeof writeUART === 'function') writeUART('SERVO1:OFF');
    if (typeof board3dUpdate === 'function') board3dUpdate('servo1', 90);
    if (typeof addActivity === 'function') addActivity('⏹️ Motor 1 stopped', 'sent');
  });

  s2Send && s2Send.addEventListener('click', () => {
    const raw = Math.min(180, Math.max(0, parseInt(s2Num.value || 0, 10)));
    const v = applyTrim(raw, servo2Trim);
    if (typeof writeUART === 'function') writeUART('SERVO2:' + v);
    if (typeof board3dUpdate === 'function') board3dUpdate('servo2', v);
    if (typeof addActivity === 'function') addActivity('⚙️ Motor 2 → ' + raw + '°' + (servo2Trim ? ' (trim ' + (servo2Trim>0?'+':'') + servo2Trim + '° = ' + v + '°)' : ''), 'sent');
  });
  s2Off && s2Off.addEventListener('click', () => {
    if (typeof writeUART === 'function') writeUART('SERVO2:OFF');
    if (typeof board3dUpdate === 'function') board3dUpdate('servo2', 90);
    if (typeof addActivity === 'function') addActivity('⏹️ Motor 2 stopped', 'sent');
  });

  // disable servo controls when not connected
  function setServoDisabled(disabled) {
    [s1Range, s1Num, s1Send, s1Off, s2Range, s2Num, s2Send, s2Off].forEach(el => {
      if (!el) return;
      el.disabled = !!disabled;
    });
  }

  // initial state: disabled until connected
  setServoDisabled(true);

  // Enable/disable servos based on connection state via event bus
  connectionEvents.addEventListener('change', (e) => {
    setServoDisabled(!e.detail.connected);
  });
})();

// --- Servo gauges ---
function updateServoGauge(needleId, value, valueId) {
    const angle = -90 + (value * 180 / 180); // map 0–180 to -90 to +90
    const needle = document.getElementById(needleId);
    if (needle) needle.setAttribute("transform", `rotate(${angle} 80 80)`);

    const valEl = document.getElementById(valueId);
    if (valEl) valEl.textContent = value + "°";
}

// Wire gauge updates to sliders
const servo1AngleEl = document.getElementById('servo1Angle');
const servo1NumberEl = document.getElementById('servo1Number');
const servo2AngleEl = document.getElementById('servo2Angle');
const servo2NumberEl = document.getElementById('servo2Number');

if (servo1AngleEl) {
    servo1AngleEl.addEventListener("input", () => {
        updateServoGauge("servo1Needle", servo1AngleEl.value, "servo1GaugeValue");
    });
}
if (servo1NumberEl) {
    servo1NumberEl.addEventListener("input", () => {
        updateServoGauge("servo1Needle", servo1NumberEl.value, "servo1GaugeValue");
    });
}
if (servo2AngleEl) {
    servo2AngleEl.addEventListener("input", () => {
        updateServoGauge("servo2Needle", servo2AngleEl.value, "servo2GaugeValue");
    });
}
if (servo2NumberEl) {
    servo2NumberEl.addEventListener("input", () => {
        updateServoGauge("servo2Needle", servo2NumberEl.value, "servo2GaugeValue");
    });
}
