// ============================================================
// others.js — Others tab widget handlers
// ============================================================
(function() {
    // --- Button ---
    const otherButton = document.getElementById('otherButton');
    if (otherButton) {
        otherButton.addEventListener('click', () => {
            sendLine('OTHER:BTN:PRESS');
        });
    }

    // --- Switch ---
    const otherSwitch = document.getElementById('otherSwitch');
    const otherSwitchLabel = document.getElementById('otherSwitchLabel');
    if (otherSwitch) {
        otherSwitch.addEventListener('change', () => {
            const state = otherSwitch.checked ? 'ON' : 'OFF';
            if (otherSwitchLabel) otherSwitchLabel.textContent = state;
            sendLine('OTHER:SWITCH:' + state);
        });
    }

    // --- Slider ---
    const otherSlider = document.getElementById('otherSlider');
    const otherSliderValue = document.getElementById('otherSliderValue');
    if (otherSlider) {
        otherSlider.addEventListener('input', () => {
            const v = otherSlider.value;
            if (otherSliderValue) otherSliderValue.textContent = v;
        });
        otherSlider.addEventListener('change', () => {
            sendLine('OTHER:SLIDER:' + otherSlider.value);
        });
    }

    // --- Joystick ---
    document.querySelectorAll('.other-joy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const dir = btn.dataset.otherDir;
            if (dir) sendLine('OTHER:JOY:' + dir);
        });
        // Keyboard support (Fix 13)
        btn.setAttribute('role', 'button');
        btn.setAttribute('tabindex', '0');
        btn.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                btn.click();
            }
        });
    });

    // --- Text input ---
    const otherTextInput = document.getElementById('otherTextInput');
    const otherTextSendBtn = document.getElementById('otherTextSendBtn');
    const otherTextLast = document.getElementById('otherTextLast');
    if (otherTextSendBtn && otherTextInput) {
        otherTextSendBtn.addEventListener('click', () => {
            const txt = otherTextInput.value.trim();
            if (!txt) return;
            sendLine('OTHER:TEXT:' + txt);
            if (otherTextLast) otherTextLast.textContent = txt;
            otherTextInput.value = '';
        });
    }

    // --- LED indicator toggle ---
    const otherLed = document.getElementById('otherLed');
    const otherLedState = document.getElementById('otherLedState');
    const otherLedToggle = document.getElementById('otherLedToggle');
    let ledOn = false;
    if (otherLedToggle && otherLed) {
        otherLedToggle.addEventListener('click', () => {
            ledOn = !ledOn;
            otherLed.style.backgroundColor = ledOn ? '#22c55e' : '#333';
            if (otherLedState) otherLedState.textContent = ledOn ? 'On' : 'Off';
            sendLine('OTHER:LED:' + (ledOn ? 'ON' : 'OFF'));
        });
    }

    // --- Level bar ---
    const otherLevel = document.getElementById('otherLevel');
    const otherLevelLabel = document.getElementById('otherLevelLabel');
    function setOtherLevel(val) {
        if (otherLevel) otherLevel.value = val;
        if (otherLevelLabel) otherLevelLabel.textContent = val + '%';
    }

    // --- Sensor simulators (sliders with live display) ---
    const simTemp = document.getElementById('otherSimTemp');
    const simTempValue = document.getElementById('otherSimTempValue');
    if (simTemp) {
        simTemp.addEventListener('input', () => {
            if (simTempValue) simTempValue.textContent = simTemp.value + '°C';
        });
        simTemp.addEventListener('change', () => {
            sendLine('OTHER:SIM_TEMP:' + simTemp.value);
        });
    }

    const simLight = document.getElementById('otherSimLight');
    const simLightValue = document.getElementById('otherSimLightValue');
    if (simLight) {
        simLight.addEventListener('input', () => {
            if (simLightValue) simLightValue.textContent = simLight.value;
        });
        simLight.addEventListener('change', () => {
            sendLine('OTHER:SIM_LIGHT:' + simLight.value);
        });
    }

    const simSound = document.getElementById('otherSimSound');
    const simSoundValue = document.getElementById('otherSimSoundValue');
    if (simSound) {
        simSound.addEventListener('input', () => {
            if (simSoundValue) simSoundValue.textContent = simSound.value;
        });
        simSound.addEventListener('change', () => {
            sendLine('OTHER:SIM_SOUND:' + simSound.value);
        });
    }

    // --- Pin checkboxes ---
    ['D0', 'D1', 'D2', 'D8', 'D12', 'D16'].forEach(pin => {
        const el = document.getElementById('otherPin' + pin);
        if (el) {
            el.addEventListener('change', () => {
                sendLine('OTHER:PIN:' + pin + ':' + (el.checked ? '1' : '0'));
            });
        }
    });

    // --- PWM slider for P0 ---
    const pwm0 = document.getElementById('otherPinPwm0');
    if (pwm0) {
        pwm0.addEventListener('change', () => {
            sendLine('OTHER:PWM:P0:' + pwm0.value);
        });
    }

    // --- Servo (Others tab version) ---
    const otherServoAngle = document.getElementById('otherServoAngle');
    const otherServoAngleValue = document.getElementById('otherServoAngleValue');
    const otherServoSpeed = document.getElementById('otherServoSpeed');
    const otherServoSpeedValue = document.getElementById('otherServoSpeedValue');
    const otherServoRunBtn = document.getElementById('otherServoRunBtn');

    if (otherServoAngle && otherServoAngleValue) {
        otherServoAngle.addEventListener('input', () => {
            otherServoAngleValue.textContent = otherServoAngle.value + '°';
        });
    }
    if (otherServoSpeed && otherServoSpeedValue) {
        otherServoSpeed.addEventListener('input', () => {
            otherServoSpeedValue.textContent = otherServoSpeed.value;
        });
    }
    if (otherServoRunBtn) {
        otherServoRunBtn.addEventListener('click', () => {
            const angle = otherServoAngle ? otherServoAngle.value : 90;
            const speed = otherServoSpeed ? otherServoSpeed.value : 5;
            sendLine('OTHER:SERVO:' + angle + ',' + speed);
        });
    }
    const otherServoOffBtn = document.getElementById('otherServoOffBtn');
    if (otherServoOffBtn) {
        otherServoOffBtn.addEventListener('click', () => {
            sendLine('SERVO1:OFF');
        });
    }

    // --- Keypad ---
    document.querySelectorAll('.other-keypad-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.key;
            if (key) {
                sendLine('OTHER:KEY:' + key);
                const lastEl = document.getElementById('otherKeypadLast');
                if (lastEl) lastEl.textContent = key;
            }
        });
    });

    // --- LED Matrix (Others tab - 5x5 mini) ---
    const otherMatrixCells = document.querySelectorAll('.other-matrix-cell');
    const otherLedMatrixClear = document.getElementById('otherLedMatrixClear');
    let otherMatrixState = Array(25).fill(false);

    otherMatrixCells.forEach(cell => {
        cell.addEventListener('click', () => {
            const idx = parseInt(cell.dataset.index, 10);
            otherMatrixState[idx] = !otherMatrixState[idx];
            cell.classList.toggle('on', otherMatrixState[idx]);
            let hex = '';
            for (let row = 0; row < 5; row++) {
                let val = 0;
                for (let col = 0; col < 5; col++) {
                    if (otherMatrixState[row * 5 + col]) val |= (1 << col);
                }
                hex += val.toString(16).toUpperCase().padStart(2, '0');
            }
            sendLine('LM:' + hex);
        });
    });

    if (otherLedMatrixClear) {
        otherLedMatrixClear.addEventListener('click', () => {
            otherMatrixState.fill(false);
            otherMatrixCells.forEach(c => c.classList.remove('on'));
            sendLine('LM:0000000000');
        });
    }

    // --- RGB Strip ---
    const stripLeds = document.querySelectorAll('.other-strip-led');
    const stripClearBtn = document.getElementById('otherStripClearBtn');
    let stripColors = Array(8).fill('#000000');

    stripLeds.forEach(led => {
        led.addEventListener('click', () => {
            const idx = parseInt(led.dataset.index, 10);
            const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff8800', '#00ffff', '#ffffff', '#000000'];
            const currentIdx = colors.indexOf(stripColors[idx]);
            const nextIdx = (currentIdx + 1) % colors.length;
            stripColors[idx] = colors[nextIdx];
            led.style.backgroundColor = stripColors[idx];
            sendLine('OTHER:STRIP:' + idx + ':' + stripColors[idx].replace('#', ''));
        });
    });

    if (stripClearBtn) {
        stripClearBtn.addEventListener('click', () => {
            stripColors.fill('#000000');
            stripLeds.forEach(l => l.style.backgroundColor = '#000000');
            sendLine('OTHER:STRIP:CLEAR');
        });
    }

    // --- File upload (just logs the filename) ---
    const fileUpload = document.getElementById('otherFileUpload');
    const fileLabel = document.getElementById('otherFileUploadLabel');
    if (fileUpload) {
        fileUpload.addEventListener('change', () => {
            if (fileUpload.files.length > 0) {
                const name = fileUpload.files[0].name;
                if (fileLabel) fileLabel.textContent = 'Loaded: ' + name;
                if (typeof addLogLine === 'function') addLogLine('File selected: ' + name, 'info');
            }
        });
    }

    // --- Buzzer (Others tab) ---
    const otherBuzzFreq = document.getElementById('otherBuzzFreq');
    const otherBuzzFreqValue = document.getElementById('otherBuzzFreqValue');
    const otherBuzzDur = document.getElementById('otherBuzzDur');
    const otherBuzzPlayBtn = document.getElementById('otherBuzzPlayBtn');
    if (otherBuzzFreq && otherBuzzFreqValue) {
        otherBuzzFreq.addEventListener('input', () => {
            otherBuzzFreqValue.textContent = otherBuzzFreq.value + ' Hz';
        });
    }
    if (otherBuzzPlayBtn) {
        otherBuzzPlayBtn.addEventListener('click', () => {
            const freq = otherBuzzFreq ? otherBuzzFreq.value : 500;
            const dur = otherBuzzDur ? otherBuzzDur.value : 200;
            sendLine('BUZZ:' + freq + ',' + dur);
        });
    }

    // --- Timer / Stopwatch ---
    const timerDisplay = document.getElementById('otherTimerDisplay');
    const timerStartBtn = document.getElementById('otherTimerStartBtn');
    const timerStopBtn = document.getElementById('otherTimerStopBtn');
    const timerResetBtn = document.getElementById('otherTimerResetBtn');
    let timerInterval = null;
    let timerStart = 0;
    let timerElapsed = 0;

    function updateTimerDisplay() {
        const total = timerElapsed + (timerInterval ? Date.now() - timerStart : 0);
        const mins = Math.floor(total / 60000);
        const secs = Math.floor((total % 60000) / 1000);
        const tenths = Math.floor((total % 1000) / 100);
        if (timerDisplay) timerDisplay.textContent =
            String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0') + '.' + tenths;
    }

    if (timerStartBtn) {
        timerStartBtn.addEventListener('click', () => {
            if (timerInterval) return;
            timerStart = Date.now();
            timerInterval = setInterval(updateTimerDisplay, 100);
        });
    }
    if (timerStopBtn) {
        timerStopBtn.addEventListener('click', () => {
            if (!timerInterval) return;
            timerElapsed += Date.now() - timerStart;
            clearInterval(timerInterval);
            timerInterval = null;
            updateTimerDisplay();
        });
    }
    if (timerResetBtn) {
        timerResetBtn.addEventListener('click', () => {
            if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
            timerElapsed = 0;
            updateTimerDisplay();
        });
    }

    // --- Delay Action ---
    const scheduleDelay = document.getElementById('otherScheduleDelay');
    const scheduleActionBtn = document.getElementById('otherScheduleActionBtn');
    if (scheduleActionBtn) {
        scheduleActionBtn.addEventListener('click', () => {
            const ms = scheduleDelay ? parseInt(scheduleDelay.value, 10) || 1000 : 1000;
            scheduleActionBtn.disabled = true;
            scheduleActionBtn.textContent = t('waiting') + ' ' + ms + 'ms...';
            setTimeout(() => {
                sendLine('OTHER:DELAYED_ACTION');
                scheduleActionBtn.disabled = false;
                scheduleActionBtn.textContent = t('schedule_action');
                if (typeof showToast === 'function') showToast(t('toast_delayed'), 'info');
            }, ms);
        });
    }

    // --- Random generator ---
    const randomBtn = document.getElementById('otherRandomNumberBtn');
    const randomValue = document.getElementById('otherRandomNumberValue');
    if (randomBtn) {
        randomBtn.addEventListener('click', () => {
            const val = Math.floor(Math.random() * 1000);
            if (randomValue) randomValue.textContent = val;
            sendLine('OTHER:RANDOM:' + val);
        });
    }

    // --- Mode selector ---
    const modeSelect = document.getElementById('otherModeSelect');
    if (modeSelect) {
        modeSelect.addEventListener('change', () => {
            sendLine('OTHER:MODE:' + modeSelect.value.toUpperCase());
        });
    }

    // --- Numeric input ---
    const numberInput = document.getElementById('otherNumberInput');
    if (numberInput) {
        numberInput.addEventListener('change', () => {
            sendLine('OTHER:NUMBER:' + numberInput.value);
        });
    }

    // --- Dual range ---
    const rangeMin = document.getElementById('otherRangeMin');
    const rangeMinValue = document.getElementById('otherRangeMinValue');
    const rangeMax = document.getElementById('otherRangeMax');
    const rangeMaxValue = document.getElementById('otherRangeMaxValue');
    if (rangeMin && rangeMinValue) {
        rangeMin.addEventListener('input', () => { rangeMinValue.textContent = rangeMin.value; });
        rangeMin.addEventListener('change', () => {
            sendLine('OTHER:RANGE_MIN:' + rangeMin.value);
        });
    }
    if (rangeMax && rangeMaxValue) {
        rangeMax.addEventListener('input', () => { rangeMaxValue.textContent = rangeMax.value; });
        rangeMax.addEventListener('change', () => {
            sendLine('OTHER:RANGE_MAX:' + rangeMax.value);
        });
    }

    // --- Color picker ---
    const colorPicker = document.getElementById('otherColorPicker');
    const colorValue = document.getElementById('otherColorValue');
    if (colorPicker) {
        colorPicker.addEventListener('input', () => {
            if (colorValue) colorValue.textContent = colorPicker.value;
        });
        colorPicker.addEventListener('change', () => {
            sendLine('OTHER:COLOR:' + colorPicker.value.replace('#', ''));
        });
    }

    // --- Presets (save/load to localStorage) ---
    const presetName = document.getElementById('otherPresetName');
    const presetSaveBtn = document.getElementById('otherPresetSaveBtn');
    const presetLoadSelect = document.getElementById('otherPresetLoadSelect');
    const presetLoadBtn = document.getElementById('otherPresetLoadBtn');

    function getPresets() {
        try { return JSON.parse(localStorage.getItem('mb_other_presets') || '{}'); } catch { return {}; }
    }
    function savePresets(presets) {
        try { localStorage.setItem('mb_other_presets', JSON.stringify(presets)); } catch {}
    }
    function refreshPresetList() {
        if (!presetLoadSelect) return;
        const presets = getPresets();
        const keys = Object.keys(presets);
        presetLoadSelect.innerHTML = keys.length === 0
            ? '<option value="">(no presets)</option>'
            : keys.map(k => '<option value="' + k + '">' + k + '</option>').join('');
    }

    if (presetSaveBtn) {
        presetSaveBtn.addEventListener('click', () => {
            const name = presetName ? presetName.value.trim() : '';
            if (!name) { if (typeof showToast === 'function') showToast(t('toast_enter_name'), 'warning'); return; }
            const state = {
                slider: otherSlider ? otherSlider.value : 50,
                switch: otherSwitch ? otherSwitch.checked : false,
                color: colorPicker ? colorPicker.value : '#ff0000',
                mode: modeSelect ? modeSelect.value : 'idle',
                number: numberInput ? numberInput.value : 100,
                rangeMin: rangeMin ? rangeMin.value : 20,
                rangeMax: rangeMax ? rangeMax.value : 80
            };
            const presets = getPresets();
            presets[name] = state;
            savePresets(presets);
            refreshPresetList();
            if (typeof showToast === 'function') showToast(t('toast_preset_saved') + ' "' + name + '"', 'success');
        });
    }

    if (presetLoadBtn) {
        presetLoadBtn.addEventListener('click', () => {
            const sel = presetLoadSelect ? presetLoadSelect.value : '';
            if (!sel) return;
            const presets = getPresets();
            const state = presets[sel];
            if (!state) return;
            if (otherSlider) { otherSlider.value = state.slider; if (otherSliderValue) otherSliderValue.textContent = state.slider; }
            if (otherSwitch) { otherSwitch.checked = state.switch; if (otherSwitchLabel) otherSwitchLabel.textContent = state.switch ? 'On' : 'Off'; }
            if (colorPicker) { colorPicker.value = state.color; if (colorValue) colorValue.textContent = state.color; }
            if (modeSelect) modeSelect.value = state.mode;
            if (numberInput) numberInput.value = state.number;
            if (rangeMin) { rangeMin.value = state.rangeMin; if (rangeMinValue) rangeMinValue.textContent = state.rangeMin; }
            if (rangeMax) { rangeMax.value = state.rangeMax; if (rangeMaxValue) rangeMaxValue.textContent = state.rangeMax; }
            if (typeof showToast === 'function') showToast(t('toast_preset_loaded') + ' "' + sel + '"', 'info');
        });
    }

    refreshPresetList();

    // --- Global reset ---
    const globalResetBtn = document.getElementById('otherGlobalResetBtn');
    if (globalResetBtn) {
        globalResetBtn.addEventListener('click', () => {
            if (otherSlider) { otherSlider.value = 50; if (otherSliderValue) otherSliderValue.textContent = '50'; }
            if (otherSwitch) { otherSwitch.checked = false; if (otherSwitchLabel) otherSwitchLabel.textContent = 'Off'; }
            if (colorPicker) { colorPicker.value = '#ff0000'; if (colorValue) colorValue.textContent = '#ff0000'; }
            if (modeSelect) modeSelect.value = 'idle';
            if (numberInput) numberInput.value = 100;
            if (rangeMin) { rangeMin.value = 20; if (rangeMinValue) rangeMinValue.textContent = '20'; }
            if (rangeMax) { rangeMax.value = 80; if (rangeMaxValue) rangeMaxValue.textContent = '80'; }
            ledOn = false;
            if (otherLed) otherLed.style.backgroundColor = '#333';
            if (otherLedState) otherLedState.textContent = 'Off';
            if (typeof showToast === 'function') showToast(t('toast_controls_reset'), 'info');
        });
    }

    // --- Global clear graphs & logs ---
    const globalClearBtn = document.getElementById('otherGlobalClearBtn');
    if (globalClearBtn) {
        globalClearBtn.addEventListener('click', () => {
            const graphClear = document.getElementById('graphClearBtn');
            if (graphClear) graphClear.click();
            const consoleClear = document.getElementById('otherConsoleClear');
            if (consoleClear) consoleClear.click();
            if (typeof showToast === 'function') showToast(t('toast_cleared'), 'info');
        });
    }

    // --- Theme (Others tab version) ---
    const otherThemeSelect = document.getElementById('otherThemeSelect');
    if (otherThemeSelect) {
        otherThemeSelect.addEventListener('change', () => {
            const val = otherThemeSelect.value;
            // Map to the main theme system
            const themeMap = { system: 'stealth', dark: 'stealth', light: 'arctic', funny: 'neon' };
            const theme = themeMap[val] || 'stealth';
            document.documentElement.setAttribute('data-theme', theme);
            // Sync main theme picker buttons
            document.querySelectorAll('.theme-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.theme === theme);
            });
            try { localStorage.setItem('mb_theme', theme); } catch {}
        });
    }

    // --- XY Pad ---
    const xyPad = document.getElementById('otherXYPad');
    const xyDot = document.getElementById('otherXYDot');
    const xValue = document.getElementById('otherXValue');
    const yValue = document.getElementById('otherYValue');
    if (xyPad) {
        function handleXY(e) {
            const rect = xyPad.getBoundingClientRect();
            const touch = e.touches ? e.touches[0] : e;
            let x = (touch.clientX - rect.left) / rect.width;
            let y = (touch.clientY - rect.top) / rect.height;
            x = Math.max(0, Math.min(1, x));
            y = Math.max(0, Math.min(1, y));
            if (xyDot) { xyDot.style.left = (x * 100) + '%'; xyDot.style.top = (y * 100) + '%'; }
            if (xValue) xValue.textContent = x.toFixed(2);
            if (yValue) yValue.textContent = y.toFixed(2);
            sendLine('OTHER:XY:' + x.toFixed(2) + ',' + y.toFixed(2));
        }

        let xyDown = false;
        xyPad.addEventListener('pointerdown', (e) => { xyDown = true; handleXY(e); });
        xyPad.addEventListener('pointermove', (e) => { if (xyDown) handleXY(e); });
        window.addEventListener('pointerup', () => { xyDown = false; });
    }

    // --- Debug Console ---
    const otherConsole = document.getElementById('otherConsole');
    const otherConsoleClear = document.getElementById('otherConsoleClear');

    // Expose a function for other modules to log to the debug console
    window.otherConsoleLog = function(msg) {
        if (!otherConsole) return;
        const line = document.createElement('div');
        line.textContent = new Date().toLocaleTimeString() + ' ' + msg;
        otherConsole.appendChild(line);
        otherConsole.scrollTop = otherConsole.scrollHeight;
        // Keep max 200 lines
        while (otherConsole.children.length > 200) otherConsole.removeChild(otherConsole.firstChild);
    };

    if (otherConsoleClear) {
        otherConsoleClear.addEventListener('click', () => {
            if (otherConsole) otherConsole.innerHTML = '';
        });
    }

    // --- Data Capture ---
    const otherDataTable = document.getElementById('otherDataTable');
    const otherCsvDownloadBtn = document.getElementById('otherCsvDownloadBtn');
    let capturedData = [];

    // Expose a function for other modules to push data samples
    window.otherCaptureData = function(label, value) {
        const entry = { time: new Date().toLocaleTimeString(), label, value };
        capturedData.push(entry);
        if (otherDataTable) {
            if (capturedData.length === 1) otherDataTable.innerHTML = '';
            const line = document.createElement('div');
            line.textContent = entry.time + ' | ' + label + ': ' + value;
            otherDataTable.appendChild(line);
            otherDataTable.scrollTop = otherDataTable.scrollHeight;
        }
    };

    if (otherCsvDownloadBtn) {
        otherCsvDownloadBtn.addEventListener('click', () => {
            if (capturedData.length === 0) {
                if (typeof showToast === 'function') showToast(t('toast_no_capture'), 'warning');
                return;
            }
            let csv = 'Time,Label,Value\n';
            capturedData.forEach(d => { csv += d.time + ',' + d.label + ',' + d.value + '\n'; });
            const blob = new Blob([csv], { type: 'text/csv' });
            const link = document.createElement('a');
            link.download = 'microbit-data-capture.csv';
            link.href = URL.createObjectURL(blob);
            link.click();
            URL.revokeObjectURL(link.href);
        });
    }

    // --- Live Graph & Multi-Graph (mini Chart.js charts) ---
    const liveChartCanvas = document.getElementById('otherLiveChart');
    const multiChartCanvas = document.getElementById('otherMultiChart');

    if (liveChartCanvas && typeof Chart !== 'undefined') {
        const liveChart = new Chart(liveChartCanvas.getContext('2d'), {
            type: 'line',
            data: { labels: [], datasets: [{ label: 'Live', data: [], borderColor: '#22c55e', borderWidth: 1, pointRadius: 0, fill: false }] },
            options: { responsive: true, maintainAspectRatio: false, animation: { duration: 0 }, scales: { x: { display: false }, y: { display: true, ticks: { font: { size: 9 } } } }, plugins: { legend: { display: false } } }
        });
        let liveIdx = 0;
        window.otherLiveChartPush = function(val) {
            liveChart.data.labels.push(liveIdx++);
            liveChart.data.datasets[0].data.push(val);
            if (liveChart.data.labels.length > 50) { liveChart.data.labels.shift(); liveChart.data.datasets[0].data.shift(); }
            liveChart.update('none');
        };
    }

    if (multiChartCanvas && typeof Chart !== 'undefined') {
        const multiChart = new Chart(multiChartCanvas.getContext('2d'), {
            type: 'line',
            data: { labels: [], datasets: [] },
            options: { responsive: true, maintainAspectRatio: false, animation: { duration: 0 }, scales: { x: { display: false }, y: { display: true, ticks: { font: { size: 9 } } } }, plugins: { legend: { labels: { font: { size: 9 } } } } }
        });
        const multiData = {};
        let multiIdx = 0;
        const multiColors = ['#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#a855f7'];
        window.otherMultiChartPush = function(label, val) {
            if (!multiData[label]) {
                const ci = Object.keys(multiData).length % multiColors.length;
                multiData[label] = { data: [], color: multiColors[ci] };
                multiChart.data.datasets.push({ label, data: multiData[label].data, borderColor: multiData[label].color, borderWidth: 1, pointRadius: 0, fill: false });
            }
            multiChart.data.labels.push(multiIdx++);
            Object.keys(multiData).forEach(k => { multiData[k].data.push(k === label ? val : null); });
            if (multiChart.data.labels.length > 50) {
                multiChart.data.labels.shift();
                multiChart.data.datasets.forEach(ds => ds.data.shift());
            }
            multiChart.update('none');
        };
    }

    // --- Others Response area: show OTHER:ACK messages ---
    window.otherShowResponse = function(msg) {
        const el = document.getElementById('otherResponse');
        if (!el) return;
        const line = document.createElement('div');
        line.textContent = msg;
        el.appendChild(line);
        el.scrollTop = el.scrollHeight;
        while (el.children.length > 50) el.removeChild(el.firstChild);
    };

})();
