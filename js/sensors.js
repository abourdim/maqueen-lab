// ============================================================
// sensors.js — Charts, UART parsing, calibration, button pills
// ============================================================

// ==================== CALIBRATION STATE ====================

const calibration = {
    accelOffset: { x: 0, y: 0, z: 0 },
    soundBaseline: 0,
    lightBaseline: 0,
    compassCalibrated: false
};

// Restore from localStorage
(function restoreCalibration() {
    try {
        const saved = localStorage.getItem('mb_calibration');
        if (saved) {
            const c = JSON.parse(saved);
            if (c.accelOffset) calibration.accelOffset = c.accelOffset;
            if (typeof c.soundBaseline === 'number') calibration.soundBaseline = c.soundBaseline;
            if (typeof c.lightBaseline === 'number') calibration.lightBaseline = c.lightBaseline;
            if (c.compassCalibrated) calibration.compassCalibrated = c.compassCalibrated;
        }
    } catch {}
})();

function saveCalibration() {
    try { localStorage.setItem('mb_calibration', JSON.stringify(calibration)); } catch {}
}

// Latest raw values for "Set Level" / "Set Ambient"
let lastRawAccel = { x: 0, y: 0, z: 0 };
let lastRawSound = 0;
let lastRawLight = 0;

// Sensor state elements (additional)
const btnAStateEl    = $('btnAState');
const btnADotEl      = $('btnADot');
const btnATextEl     = $('btnAText');
const btnBStateEl    = $('btnBState');
const btnBDotEl      = $('btnBDot');
const btnBTextEl     = $('btnBText');
const touchP0StateEl = $('touchP0State');
const touchP0DotEl   = $('touchP0Dot');
const touchP0TextEl  = $('touchP0Text');
const touchP1StateEl = $('touchP1State');
const touchP1DotEl   = $('touchP1Dot');
const touchP1TextEl  = $('touchP1Text');
const touchP2StateEl = $('touchP2State');
const touchP2DotEl   = $('touchP2Dot');
const touchP2TextEl  = $('touchP2Text');
const logoStateEl    = $('logoState');
const logoDotEl      = $('logoDot');
const logoTextEl     = $('logoText');
const compassHeadingValueEl = $('compassHeadingValue');

// Charts
let tempChart, lightChart, soundChart, motionChart;
let accelXChart, accelYChart, accelZChart;
let btnAChart, btnBChart;
let touchP0Chart, touchP1Chart, touchP2Chart, logoChart;
const MAX_POINTS = 50;

// ------------ Charts ------------

// Sparkline color + style per sensor
var SPARKLINE_STYLES = {
    tempChart:    { color: '#06b6d4', dash: [] },          // cyan, solid
    lightChart:   { color: '#eab308', dash: [] },          // yellow, solid
    soundChart:   { color: '#a855f7', dash: [] },          // purple, solid
    motionChart:  { color: '#ef4444', dash: [4, 2] },      // red, dashed
    accelXChart:  { color: '#ef4444', dash: [] },          // red, solid
    accelYChart:  { color: '#22c55e', dash: [] },          // green, solid
    accelZChart:  { color: '#3b82f6', dash: [] },          // blue, solid
    btnAChart:    { color: '#f97316', dash: [2, 2] },      // orange, dotted
    btnBChart:    { color: '#ec4899', dash: [2, 2] },      // pink, dotted
    touchP0Chart: { color: '#0ea5e9', dash: [] },          // sky blue, solid
    touchP1Chart: { color: '#d946ef', dash: [] },          // fuchsia, solid
    touchP2Chart: { color: '#14b8a6', dash: [] },          // teal, solid
    logoChart:    { color: '#f59e0b', dash: [6, 3] }       // amber, long dash
};

function createChart(canvasId, label) {
    const canvas = $(canvasId);
    if (!canvas || typeof Chart === 'undefined') return null;

    var style = SPARKLINE_STYLES[canvasId] || { color: '#22c55e', dash: [] };

    return new Chart(canvas, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label,
                data: [],
                borderColor: style.color,
                backgroundColor: style.color + '20',
                borderWidth: 2,
                borderDash: style.dash,
                pointRadius: 0,
                tension: 0.25,
                fill: true
            }]
        },
        options: {
            responsive: true,
            animation: false,
            plugins: {
                legend: { display: false },
                title: { display: false }
            },
            scales: {
                x: { display: false },
                y: {
                    ticks: { font: { size: 9 } }
                }
            }
        }
    });
}

function pushPoint(chart, value) {
    if (!chart) return;
    const d = chart.data;
    d.labels.push('');
    d.datasets[0].data.push(value);
    if (d.labels.length > MAX_POINTS) {
        d.labels.shift();
        d.datasets[0].data.shift();
    }
    chart.update();
}

// ------------ Button pill visuals ------------

function setButtonPill(pill, dot, textNode, pressed) {
    if (!pill || !dot || !textNode) return;
    if (pressed) {
        pill.classList.add('active');
        dot.style.backgroundColor = '#22c55e';
        textNode.textContent = t('pressed');
    } else {
        pill.classList.remove('active');
        dot.style.backgroundColor = '';
        textNode.textContent = t('ready');
    }
}

// ------------ UART RX parsing (with error handling) ------------

function handleUartLine(line) {
    try {
        const ln = line.trim();
        if (!ln) return;

        addLogLine('RX < ' + ln, 'rx');

        if (ln.startsWith('BENCH:')) {
            const resp = ln.slice(6).trim();
            const respWin = document.getElementById("benchResponse");
            if (respWin) {
                const lineEl = document.createElement("div");
                lineEl.textContent = resp;
                respWin.appendChild(lineEl);
                // Cap at 100 entries to prevent unbounded growth
                while (respWin.children.length > 100) {
                    respWin.removeChild(respWin.firstChild);
                }
            }
            addLogLine("Bench response: " + resp, "rx");
            return;
        }

        if (ln.startsWith('TEMP:')) {
            const v = parseInt(ln.slice(5), 10);
            if (!Number.isNaN(v)) {
                if (tempValueEl) tempValueEl.textContent = v;
                pushPoint(tempChart, v);
                if (typeof graphPushData === 'function') graphPushData('temp', v, 'Temp');
                if (typeof board3dUpdate === 'function') board3dUpdate('temp', v);
            }
            return;
        }

        if (ln.startsWith('LIGHT:')) {
            const v = parseInt(ln.slice(6), 10);
            if (!Number.isNaN(v)) {
                lastRawLight = v;
                const display = v - calibration.lightBaseline;
                if (lightValueEl) lightValueEl.textContent = display;
                pushPoint(lightChart, display);
                if (typeof graphPushData === 'function') graphPushData('light', display, 'Light');
                if (typeof board3dUpdate === 'function') board3dUpdate('light', display);
            }
            return;
        }

        if (ln.startsWith('SOUND:')) {
            const v = parseInt(ln.slice(6), 10);
            if (!Number.isNaN(v)) {
                lastRawSound = v;
                const display = v - calibration.soundBaseline;
                if (soundValueEl) soundValueEl.textContent = display;
                pushPoint(soundChart, display);
                if (typeof graphPushData === 'function') graphPushData('sound', display, 'Sound');
                if (typeof board3dUpdate === 'function') board3dUpdate('sound', display);
            }
            return;
        }

        if (ln.startsWith('ACC:')) {
            const parts = ln.slice(4).split(',');
            if (parts.length === 3) {
                const ax = parseInt(parts[0], 10);
                const ay = parseInt(parts[1], 10);
                const az = parseInt(parts[2], 10);
                if (![ax,ay,az].some(Number.isNaN)) {
                    lastRawAccel = { x: ax, y: ay, z: az };
                    const cx = ax - calibration.accelOffset.x;
                    const cy = ay - calibration.accelOffset.y;
                    const cz = az - calibration.accelOffset.z;
                    const mag = Math.round(Math.sqrt(cx*cx + cy*cy + cz*cz));
                    if (accelXValueEl) accelXValueEl.textContent = cx;
                    if (accelYValueEl) accelYValueEl.textContent = cy;
                    if (accelZValueEl) accelZValueEl.textContent = cz;
                    if (motionValueEl) motionValueEl.textContent = mag;

                    pushPoint(accelXChart, cx);
                    pushPoint(accelYChart, cy);
                    pushPoint(accelZChart, cz);
                    pushPoint(motionChart, mag);
                    if (typeof graphPushData === 'function') {
                        graphPushData('accelX', cx, 'Accel X');
                        graphPushData('accelY', cy, 'Accel Y');
                        graphPushData('accelZ', cz, 'Accel Z');
                    }
                    if (typeof board3dUpdate === 'function') board3dUpdate('accel', { x: cx, y: cy, z: cz });
                }
            }
            return;
        }

        if (ln.startsWith('BTN:A:')) {
            const v = parseInt(ln.slice(6), 10);
            if (!Number.isNaN(v)) {
                setButtonPill(btnAStateEl, btnADotEl, btnATextEl, v === 1);
                pushPoint(btnAChart, v);
                if (typeof board3dUpdate === 'function') board3dUpdate('btnA', v === 1);
                if (v === 1 && typeof addActivity === 'function') {
                    addActivity('🔴 Button A pressed!', 'received');
                }
            }
            return;
        }

        if (ln.startsWith('BTN:B:')) {
            const v = parseInt(ln.slice(6), 10);
            if (!Number.isNaN(v)) {
                setButtonPill(btnBStateEl, btnBDotEl, btnBTextEl, v === 1);
                pushPoint(btnBChart, v);
                if (typeof board3dUpdate === 'function') board3dUpdate('btnB', v === 1);
                if (v === 1 && typeof addActivity === 'function') {
                    addActivity('🔵 Button B pressed!', 'received');
                }
            }
            return;
        }

        if (ln.startsWith('BTN:P0:')) {
            const v = parseInt(ln.slice(7), 10);
            if (!Number.isNaN(v)) {
                setButtonPill(touchP0StateEl, touchP0DotEl, touchP0TextEl, v === 1);
                pushPoint(touchP0Chart, v);
                if (typeof graphPushData === 'function') graphPushData('touchP0', v, 'Touch P0');
                if (typeof board3dUpdate === 'function') board3dUpdate('touchP0', v === 1);
                if (v === 1 && typeof addActivity === 'function') {
                    addActivity('👆 Touch P0!', 'received');
                }
            }
            return;
        }

        if (ln.startsWith('BTN:P1:')) {
            const v = parseInt(ln.slice(7), 10);
            if (!Number.isNaN(v)) {
                setButtonPill(touchP1StateEl, touchP1DotEl, touchP1TextEl, v === 1);
                pushPoint(touchP1Chart, v);
                if (typeof graphPushData === 'function') graphPushData('touchP1', v, 'Touch P1');
                if (typeof board3dUpdate === 'function') board3dUpdate('touchP1', v === 1);
            }
            return;
        }

        if (ln.startsWith('BTN:P2:')) {
            const v = parseInt(ln.slice(7), 10);
            if (!Number.isNaN(v)) {
                setButtonPill(touchP2StateEl, touchP2DotEl, touchP2TextEl, v === 1);
                pushPoint(touchP2Chart, v);
                if (typeof graphPushData === 'function') graphPushData('touchP2', v, 'Touch P2');
                if (typeof board3dUpdate === 'function') board3dUpdate('touchP2', v === 1);
            }
            return;
        }

        if (ln.startsWith('BTN:LOGO:')) {
            const v = parseInt(ln.slice(9), 10);
            if (!Number.isNaN(v)) {
                setButtonPill(logoStateEl, logoDotEl, logoTextEl, v === 1);
                pushPoint(logoChart, v);
                if (typeof board3dUpdate === 'function') board3dUpdate('logo', v === 1);
                if (v === 1 && typeof addActivity === 'function') {
                    addActivity('✨ Logo touched!', 'received');
                }
            }
            return;
        }

        if (ln.startsWith('COMPASS:')) {
            const v = parseInt(ln.slice(8), 10);
            if (!Number.isNaN(v)) {
                if (compassHeadingValueEl) compassHeadingValueEl.textContent = v;
                if (typeof graphPushData === 'function') graphPushData('compass', v, 'Compass');
                if (typeof board3dUpdate === 'function') board3dUpdate('compass', v);
            }
            return;
        }

        if (ln.startsWith('INFO:SERIAL:')) {
            const serial = ln.slice('INFO:SERIAL:'.length);
            if (serialNumberEl) serialNumberEl.textContent = serial;
            return;
        }

        // Servo position telemetry
        if (ln.startsWith('SERVO1_POS:')) {
            const v = parseInt(ln.slice(11), 10);
            if (!Number.isNaN(v) && typeof updateServoGauge === 'function') updateServoGauge('servo1Needle', v, 'servo1GaugeValue');
            return;
        }

        if (ln.startsWith('SERVO2_POS:')) {
            const v = parseInt(ln.slice(11), 10);
            if (!Number.isNaN(v) && typeof updateServoGauge === 'function') updateServoGauge('servo2Needle', v, 'servo2GaugeValue');
            return;
        }

        // LED state telemetry from micro:bit: LEDS:r0,r1,r2,r3,r4
        if (ln.startsWith('LEDS:')) {
            const parts = ln.slice(5).split(',');
            if (parts.length === 5) {
                const ledGrid = [];
                for (let r = 0; r < 5; r++) {
                    const bits = parseInt(parts[r], 10);
                    ledGrid[r] = [];
                    for (let c = 0; c < 5; c++) {
                        ledGrid[r][c] = !!(bits & (1 << (4 - c)));
                    }
                }
                if (typeof board3dUpdate === 'function') board3dUpdate('leds', ledGrid);
            }
            return;
        }

        // Custom graph data: GRAPH:Label:Value
        if (ln.startsWith('GRAPH:')) {
            const parts = ln.slice(6).split(':');
            if (parts.length === 2) {
                const label = parts[0].trim();
                const v = parseFloat(parts[1]);
                if (label && !Number.isNaN(v) && typeof graphPushData === 'function') {
                    graphPushData('custom_' + label, v, label);
                }
            }
            return;
        }

        // Touch button events
        if (ln.startsWith('EVENT:TOUCH_P0_PRESSED'))  { addLogLine('Touch P0 pressed', 'success'); return; }
        if (ln.startsWith('EVENT:TOUCH_P0_RELEASED')) { addLogLine('Touch P0 released', 'info');    return; }
        if (ln.startsWith('EVENT:TOUCH_P1_PRESSED'))  { addLogLine('Touch P1 pressed', 'success'); return; }
        if (ln.startsWith('EVENT:TOUCH_P1_RELEASED')) { addLogLine('Touch P1 released', 'info');    return; }
        if (ln.startsWith('EVENT:TOUCH_P2_PRESSED'))  { addLogLine('Touch P2 pressed', 'success'); return; }
        if (ln.startsWith('EVENT:TOUCH_P2_RELEASED')) { addLogLine('Touch P2 released', 'info');    return; }
        if (ln.startsWith('EVENT:LOGO_PRESSED'))      { addLogLine('Logo pressed', 'success');      return; }
        if (ln.startsWith('EVENT:LOGO_RELEASED'))     { addLogLine('Logo released', 'info');        return; }

        // OTHER:ACK responses → Others tab response area + debug console
        if (ln.startsWith('OTHER:ACK:')) {
            const resp = ln.slice(10).trim();
            if (typeof otherShowResponse === 'function') otherShowResponse(resp);
            if (typeof otherConsoleLog === 'function') otherConsoleLog('ACK: ' + resp);
            return;
        }

        // Calibration response
        if (ln === 'CAL:COMPASS:DONE') {
            calibration.compassCalibrated = true;
            saveCalibration();
            updateCalUI();
            if (typeof showToast === 'function') showToast(t('toast_compass_cal'), 'success');
            addLogLine(t('toast_compass_cal'), 'success');
            return;
        }

        // other lines (INFO, ECHO, LOG, EVENT...) just appear in the log
    } catch (err) {
        console.error('Error parsing UART line:', line, err);
        addLogLine('Parse error: ' + err.message, 'error');
    }
}

// ==================== CALIBRATION UI ====================

function updateCalUI() {
    const compassStatus = document.getElementById('calCompassStatus');
    const accelStatus = document.getElementById('calAccelStatus');
    const accelValues = document.getElementById('calAccelValues');
    const soundStatus = document.getElementById('calSoundStatus');
    const lightStatus = document.getElementById('calLightStatus');

    if (compassStatus) {
        compassStatus.textContent = calibration.compassCalibrated ? t('cal_done') : t('cal_not_done');
        compassStatus.classList.toggle('cal-ok', calibration.compassCalibrated);
    }

    const hasAccel = calibration.accelOffset.x !== 0 || calibration.accelOffset.y !== 0 || calibration.accelOffset.z !== 0;
    if (accelStatus) {
        accelStatus.textContent = hasAccel ? t('cal_offset_set') : t('cal_no_offset');
        accelStatus.classList.toggle('cal-ok', hasAccel);
    }
    if (accelValues && hasAccel) {
        accelValues.textContent = `X:${calibration.accelOffset.x} Y:${calibration.accelOffset.y} Z:${calibration.accelOffset.z}`;
    } else if (accelValues) {
        accelValues.textContent = '';
    }

    if (soundStatus) {
        const has = calibration.soundBaseline !== 0;
        soundStatus.textContent = has ? t('cal_baseline') + ': ' + calibration.soundBaseline : t('cal_no_baseline');
        soundStatus.classList.toggle('cal-ok', has);
    }

    if (lightStatus) {
        const has = calibration.lightBaseline !== 0;
        lightStatus.textContent = has ? t('cal_baseline') + ': ' + calibration.lightBaseline : t('cal_no_baseline');
        lightStatus.classList.toggle('cal-ok', has);
    }
}

// Wire calibration buttons
document.addEventListener('DOMContentLoaded', () => {
    // Compass
    document.getElementById('calCompassBtn')?.addEventListener('click', () => {
        if (typeof sendLine === 'function') {
            sendLine('CAL:COMPASS');
            if (typeof showToast === 'function') showToast(t('toast_compass_tilt'), 'info', 5000);
        }
    });

    // Accel Zero
    document.getElementById('calAccelSetBtn')?.addEventListener('click', () => {
        calibration.accelOffset = { ...lastRawAccel };
        saveCalibration();
        updateCalUI();
        if (typeof showToast === 'function') showToast(t('toast_accel_zeroed'), 'success');
    });
    document.getElementById('calAccelResetBtn')?.addEventListener('click', () => {
        calibration.accelOffset = { x: 0, y: 0, z: 0 };
        saveCalibration();
        updateCalUI();
        if (typeof showToast === 'function') showToast(t('toast_accel_cleared'), 'info');
    });

    // Sound Baseline
    document.getElementById('calSoundSetBtn')?.addEventListener('click', () => {
        calibration.soundBaseline = lastRawSound;
        saveCalibration();
        updateCalUI();
        if (typeof showToast === 'function') showToast(t('toast_sound_baseline_set') + ': ' + lastRawSound, 'success');
    });
    document.getElementById('calSoundResetBtn')?.addEventListener('click', () => {
        calibration.soundBaseline = 0;
        saveCalibration();
        updateCalUI();
        if (typeof showToast === 'function') showToast(t('toast_sound_baseline_cleared'), 'info');
    });

    // Light Baseline
    document.getElementById('calLightSetBtn')?.addEventListener('click', () => {
        calibration.lightBaseline = lastRawLight;
        saveCalibration();
        updateCalUI();
        if (typeof showToast === 'function') showToast(t('toast_light_baseline_set') + ': ' + lastRawLight, 'success');
    });
    document.getElementById('calLightResetBtn')?.addEventListener('click', () => {
        calibration.lightBaseline = 0;
        saveCalibration();
        updateCalUI();
        if (typeof showToast === 'function') showToast(t('toast_light_baseline_cleared'), 'info');
    });

    // Init UI from saved state
    updateCalUI();
});
