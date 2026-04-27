/* ======================================================
   graph.js – Live Graph tab
   Plots micro:bit sensor data + custom GRAPH: protocol
   ====================================================== */

(function () {
    'use strict';

    // --- Sensor color palette (all distinct, no repeats) ---
    const SENSOR_COLORS = {
        accelX:  '#ef4444', // red
        accelY:  '#22c55e', // green
        accelZ:  '#3b82f6', // blue
        compass: '#f59e0b', // amber
        sound:   '#a855f7', // purple
        light:   '#eab308', // yellow
        temp:    '#06b6d4', // cyan
        touchP0: '#0ea5e9', // sky blue
        touchP1: '#d946ef', // fuchsia
        touchP2: '#14b8a6', // teal
    };

    // Rolling custom colors for GRAPH: protocol (all distinct)
    const CUSTOM_COLORS = [
        '#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#a855f7',
        '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#eab308'
    ];
    let customColorIdx = 0;

    // --- State ---
    let chart = null;
    let paused = false;
    let windowSize = 100;
    let lineWidth = 2;
    let showGrid = true;
    let currentType = 'line';
    let pointCount = 0;

    // Datasets keyed by sensor name: { label, data: [], color, active }
    const datasets = {};
    // Time labels (shared X axis)
    const timeLabels = [];
    let startTime = Date.now();

    // --- DOM refs ---
    const canvas = document.getElementById('graphCanvas');
    const pauseBtn = document.getElementById('graphPauseBtn');
    const clearBtn = document.getElementById('graphClearBtn');
    const exportPngBtn = document.getElementById('graphExportPng');
    const exportCsvBtn = document.getElementById('graphExportCsv');
    const pointCountEl = document.getElementById('graphPointCount');
    const windowSel = document.getElementById('graphWindow');
    const yAxisSel = document.getElementById('graphYAxis');
    const lineWidthSel = document.getElementById('graphLineWidth');
    const gridChk = document.getElementById('graphGrid');
    const chartWrap = document.getElementById('graphChartWrap');

    if (!canvas) return;

    // --- Initialize Chart.js ---
    function createMainChart() {
        const ctx = canvas.getContext('2d');
        chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: timeLabels,
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 0 },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: getComputedStyle(document.documentElement).getPropertyValue('--text') || '#f9fafb',
                            font: { size: 11 },
                            usePointStyle: true,
                            pointStyle: 'circle',
                            padding: 12
                        },
                        onClick: function(e, legendItem, legend) {
                            // Toggle dataset visibility
                            const idx = legendItem.datasetIndex;
                            const meta = chart.getDatasetMeta(idx);
                            meta.hidden = !meta.hidden;
                            chart.update('none');
                        }
                    },
                    tooltip: { mode: 'index', intersect: false }
                },
                scales: {
                    x: {
                        display: true,
                        title: { display: true, text: 'Time (s)', color: getThemeColor('--muted') },
                        ticks: { color: getThemeColor('--muted'), maxTicksLimit: 10 },
                        grid: { color: getThemeColor('--card-border'), display: showGrid }
                    },
                    y: {
                        display: true,
                        title: { display: true, text: 'Value', color: getThemeColor('--muted') },
                        ticks: { color: getThemeColor('--muted') },
                        grid: { color: getThemeColor('--card-border'), display: showGrid }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
    }

    function getThemeColor(varName) {
        return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || '#9ca3af';
    }

    // --- Dataset management ---
    function ensureDataset(key, label, color) {
        if (datasets[key]) return;
        datasets[key] = {
            label: label || key,
            data: [],
            color: color || CUSTOM_COLORS[customColorIdx++ % CUSTOM_COLORS.length],
            active: true
        };
        syncChartDatasets();
    }

    function syncChartDatasets() {
        if (!chart) return;
        const isArea = currentType === 'area';
        const isScatter = currentType === 'scatter';

        chart.data.datasets = Object.values(datasets)
            .filter(d => d.active)
            .map(d => ({
                label: d.label,
                data: [...d.data],
                borderColor: d.color,
                backgroundColor: isArea ? d.color + '30' : d.color,
                borderWidth: lineWidth,
                pointRadius: isScatter ? 3 : (currentType === 'realtime' ? 0 : 0),
                pointHoverRadius: 5,
                fill: isArea,
                tension: currentType === 'realtime' ? 0 : 0.3,
                showLine: !isScatter,
                spanGaps: true
            }));
        chart.update('none');
    }

    // --- Push data point (called from sensors.js) ---
    window.graphPushData = function (key, value, label) {
        if (paused) return;

        // Built-in sensor? Check if its checkbox is ticked
        const chk = document.querySelector('.graph-toggle input[data-sensor="' + key + '"]');
        if (chk && !chk.checked) return;  // has checkbox but unchecked → skip

        const now = ((Date.now() - startTime) / 1000).toFixed(1);

        // Auto-create dataset (only reached if checkbox is checked or no checkbox exists)
        if (!datasets[key]) {
            const color = SENSOR_COLORS[key] || CUSTOM_COLORS[customColorIdx++ % CUSTOM_COLORS.length];
            ensureDataset(key, label || key, color);
        }

        if (!datasets[key].active) return;

        // Add time label if needed
        if (timeLabels.length === 0 || timeLabels[timeLabels.length - 1] !== now) {
            timeLabels.push(now);
            // Pad all other datasets with null for this time slot
            Object.keys(datasets).forEach(k => {
                if (k !== key && datasets[k].data.length < timeLabels.length) {
                    datasets[k].data.push(null);
                }
            });
        }

        datasets[key].data.push(value);

        // Trim to window size
        while (timeLabels.length > windowSize) {
            timeLabels.shift();
            Object.values(datasets).forEach(d => {
                if (d.data.length > windowSize) d.data.shift();
            });
        }

        pointCount++;
        if (pointCountEl) pointCountEl.textContent = pointCount + ' pts';

        syncChartDatasets();
    };

    // --- Sensor toggles ---
    document.querySelectorAll('.graph-toggle input[data-sensor]').forEach(chk => {
        chk.addEventListener('change', () => {
            const key = chk.dataset.sensor;
            const label = chk.parentElement.textContent.trim();
            if (chk.checked) {
                ensureDataset(key, label, SENSOR_COLORS[key]);
                datasets[key].active = true;
                datasets[key].data = []; // fresh start
            } else if (datasets[key]) {
                datasets[key].active = false;
                datasets[key].data = [];
            }
            syncChartDatasets();
        });
    });

    // --- Graph type switching ---
    document.querySelectorAll('.graph-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.graph-type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentType = btn.dataset.type;

            if (!chart) return;

            if (currentType === 'bar') {
                chart.config.type = 'bar';
            } else if (currentType === 'scatter') {
                chart.config.type = 'scatter';
            } else {
                chart.config.type = 'line';
            }

            // Realtime = no animation, no tension
            if (currentType === 'realtime') {
                chart.options.animation = false;
            } else {
                chart.options.animation = { duration: 0 };
            }

            syncChartDatasets();
        });
    });

    // --- Options ---
    if (windowSel) {
        windowSel.addEventListener('change', () => {
            windowSize = parseInt(windowSel.value, 10) || 100;
        });
    }

    if (yAxisSel) {
        yAxisSel.addEventListener('change', () => {
            if (!chart) return;
            const v = yAxisSel.value;
            if (v === 'auto') {
                chart.options.scales.y.min = undefined;
                chart.options.scales.y.max = undefined;
            } else {
                const parts = v.split('-').map(Number);
                if (parts.length === 2) {
                    chart.options.scales.y.min = parts[0];
                    chart.options.scales.y.max = parts[1];
                } else if (parts.length === 3) {
                    // handles "-1024-1024" → [NaN, 1024, 1024] — fix:
                    chart.options.scales.y.min = -parts[1];
                    chart.options.scales.y.max = parts[2];
                }
            }
            chart.update('none');
        });
    }

    if (lineWidthSel) {
        lineWidthSel.addEventListener('change', () => {
            lineWidth = parseInt(lineWidthSel.value, 10) || 2;
            syncChartDatasets();
        });
    }

    if (gridChk) {
        gridChk.addEventListener('change', () => {
            showGrid = gridChk.checked;
            if (chart) {
                chart.options.scales.x.grid.display = showGrid;
                chart.options.scales.y.grid.display = showGrid;
                chart.update('none');
            }
        });
    }

    // --- Pause / Clear ---
    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => {
            paused = !paused;
            pauseBtn.textContent = paused ? '▶ ' + t('resume') : '⏸ ' + t('pause');
            pauseBtn.classList.toggle('active', paused);
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            timeLabels.length = 0;
            // Remove custom datasets entirely, deactivate sensor datasets
            Object.keys(datasets).forEach(k => {
                const chk = document.querySelector('.graph-toggle input[data-sensor="' + k + '"]');
                if (chk) {
                    // Sensor: keep dataset but clear data
                    datasets[k].data.length = 0;
                } else {
                    // Custom (GRAPH:, simulate): remove entirely
                    delete datasets[k];
                }
            });
            pointCount = 0;
            startTime = Date.now();
            customColorIdx = 0;
            if (pointCountEl) pointCountEl.textContent = '0 pts';
            syncChartDatasets();
        });
    }

    // --- Export PNG ---
    if (exportPngBtn) {
        exportPngBtn.addEventListener('click', () => {
            if (!chart) return;
            const link = document.createElement('a');
            link.download = 'microbit-graph.png';
            link.href = chart.toBase64Image();
            link.click();
        });
    }

    // --- Export CSV ---
    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', () => {
            const keys = Object.keys(datasets).filter(k => datasets[k].active);
            if (keys.length === 0) return;

            let csv = 'Time,' + keys.map(k => datasets[k].label).join(',') + '\n';
            for (let i = 0; i < timeLabels.length; i++) {
                const row = [timeLabels[i]];
                keys.forEach(k => {
                    const v = datasets[k].data[i];
                    row.push(v != null ? v : '');
                });
                csv += row.join(',') + '\n';
            }

            const blob = new Blob([csv], { type: 'text/csv' });
            const link = document.createElement('a');
            link.download = 'microbit-graph.csv';
            link.href = URL.createObjectURL(blob);
            link.click();
            URL.revokeObjectURL(link.href);
        });
    }

    // --- Simulate (sends SIMULATE:ON/OFF to micro:bit) ---
    const simBtn = document.getElementById('graphSimBtn');
    let simulating = false;
    if (simBtn) {
        simBtn.addEventListener('click', () => {
            simulating = !simulating;
            const cmd = simulating ? 'SIMULATE:ON' : 'SIMULATE:OFF';
            if (typeof sendLine === 'function') {
                sendLine(cmd);
            }
            simBtn.textContent = simulating ? '🎲 ' + t('stop_sim') : '🎲 ' + t('simulate');
            simBtn.classList.toggle('active', simulating);
        });
    }

    // --- Fullscreen graph ---
    const fsBtn = document.getElementById('graphFullscreenBtn');
    let isFullscreen = false;
    if (fsBtn) {
        fsBtn.addEventListener('click', toggleFullscreen);

        function toggleFullscreen() {
            isFullscreen = !isFullscreen;
            // Target the whole graph card, not just canvas
            const graphCard = chartWrap?.closest('.card');
            if (graphCard) {
                graphCard.classList.toggle('graph-fullscreen', isFullscreen);
            }
            fsBtn.textContent = isFullscreen ? '⬜ Exit' : '🔲 Fullscreen';
            fsBtn.classList.toggle('active', isFullscreen);

            // Force chart to fill available space
            if (chartWrap) {
                if (isFullscreen) {
                    chartWrap.style.height = 'calc(100vh - 220px)';
                    chartWrap.style.resize = 'none';
                } else {
                    chartWrap.style.height = '350px';
                    chartWrap.style.resize = 'vertical';
                }
            }
            setTimeout(() => { if (chart) chart.resize(); }, 150);
        }

        // Escape to exit fullscreen
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Escape' && isFullscreen) {
                toggleFullscreen();
            }
        });
    }

    // --- Session Recording ---
    const recBtn = document.getElementById('graphRecordBtn');
    let isRecording = false;
    let recordedData = []; // { time, key, value }

    if (recBtn) {
        recBtn.addEventListener('click', () => {
            isRecording = !isRecording;
            if (isRecording) {
                recordedData = [];
                recBtn.textContent = '⏹ ' + t('stop_rec');
                recBtn.classList.add('active');
                if (typeof showToast === 'function') showToast(t('toast_recording'), 'info');
            } else {
                recBtn.textContent = '⏺ ' + t('record');
                recBtn.classList.remove('active');
                if (typeof showToast === 'function') showToast(t('toast_rec_stop') + ' (' + recordedData.length + ')', 'success');
            }
        });
    }

    // Hook recording into data push
    const origPushData = window.graphPushData;
    window.graphPushData = function(key, value, label) {
        if (isRecording) {
            recordedData.push({ time: Date.now(), key, value, label: label || key });
        }
        origPushData(key, value, label);
    };

    // Export recording as JSON
    const recExportBtn = document.getElementById('graphRecordExport');
    if (recExportBtn) {
        recExportBtn.addEventListener('click', () => {
            if (recordedData.length === 0) {
                if (typeof showToast === 'function') showToast(t('toast_no_data'), 'warning');
                return;
            }
            const blob = new Blob([JSON.stringify(recordedData, null, 2)], { type: 'application/json' });
            const link = document.createElement('a');
            link.download = 'microbit-session.json';
            link.href = URL.createObjectURL(blob);
            link.click();
            URL.revokeObjectURL(link.href);
        });
    }

    // Replay recording
    const recPlayBtn = document.getElementById('graphRecordPlay');
    if (recPlayBtn) {
        recPlayBtn.addEventListener('click', () => {
            if (recordedData.length === 0) {
                if (typeof showToast === 'function') showToast(t('toast_no_data'), 'warning');
                return;
            }
            if (typeof showToast === 'function') showToast(t('toast_replaying') + '...', 'info');
            // Clear current
            timeLabels.length = 0;
            Object.values(datasets).forEach(d => { d.data.length = 0; });
            pointCount = 0;
            startTime = recordedData[0].time;
            syncChartDatasets();

            const base = recordedData[0].time;
            recordedData.forEach((pt, i) => {
                setTimeout(() => {
                    origPushData(pt.key, pt.value, pt.label);
                }, pt.time - base);
            });
        });
    }

    // --- Annotations (data journal) ---
    const annotateBtn = document.getElementById('graphAnnotateBtn');
    const annotations = []; // { time, text }

    if (annotateBtn) {
        annotateBtn.addEventListener('click', () => {
            const text = prompt(t('add_note_prompt'));
            if (!text) return;
            const now = ((Date.now() - startTime) / 1000).toFixed(1);
            annotations.push({ time: now, text });
            // Add annotation line to chart
            if (chart) {
                if (!chart.options.plugins.annotation) {
                    chart.options.plugins.annotation = { annotations: {} };
                }
                const id = 'note_' + annotations.length;
                chart.options.plugins.annotation.annotations[id] = {
                    type: 'line',
                    xMin: now,
                    xMax: now,
                    borderColor: 'var(--accent, #22c55e)',
                    borderWidth: 1,
                    borderDash: [4, 4],
                    label: {
                        display: true,
                        content: text,
                        position: 'start',
                        backgroundColor: 'rgba(0,0,0,0.7)',
                        color: '#fff',
                        font: { size: 10 }
                    }
                };
                chart.update('none');
            }
            if (typeof showToast === 'function') showToast(t('toast_note_added') + ': ' + text, 'info');
        });
    }

    // --- Checkbox persistence (localStorage) ---
    function saveCheckboxState() {
        const state = {};
        document.querySelectorAll('.graph-toggle input[data-sensor]').forEach(chk => {
            state[chk.dataset.sensor] = chk.checked;
        });
        try { localStorage.setItem('mb_graph_sensors', JSON.stringify(state)); } catch {}
    }

    function restoreCheckboxState() {
        try {
            const saved = localStorage.getItem('mb_graph_sensors');
            if (saved) {
                const state = JSON.parse(saved);
                document.querySelectorAll('.graph-toggle input[data-sensor]').forEach(chk => {
                    const key = chk.dataset.sensor;
                    if (key in state) {
                        chk.checked = state[key];
                    }
                });
            }
            // Initialize datasets for all currently checked sensors
            document.querySelectorAll('.graph-toggle input[data-sensor]').forEach(chk => {
                if (chk.checked) {
                    const key = chk.dataset.sensor;
                    const label = chk.parentElement.textContent.trim();
                    ensureDataset(key, label, SENSOR_COLORS[key]);
                    datasets[key].active = true;
                }
            });
            syncChartDatasets();
        } catch {}
    }

    // Save on every toggle change
    document.querySelectorAll('.graph-toggle input[data-sensor]').forEach(chk => {
        chk.addEventListener('change', saveCheckboxState);
    });

    // --- Resize handle ---
    if (chartWrap) {
        chartWrap.style.resize = 'vertical';
        chartWrap.style.overflow = 'hidden';
        chartWrap.style.minHeight = '250px';
        chartWrap.style.height = '350px';
    }

    // --- Theme observer: update chart colors on theme change ---
    const observer = new MutationObserver(() => {
        if (!chart) return;
        const textColor = getThemeColor('--text');
        const mutedColor = getThemeColor('--muted');
        const borderColor = getThemeColor('--card-border');

        chart.options.scales.x.ticks.color = mutedColor;
        chart.options.scales.x.title.color = mutedColor;
        chart.options.scales.x.grid.color = borderColor;
        chart.options.scales.y.ticks.color = mutedColor;
        chart.options.scales.y.title.color = mutedColor;
        chart.options.scales.y.grid.color = borderColor;
        chart.options.plugins.legend.labels.color = textColor;
        chart.update('none');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // --- Init ---
    createMainChart();
    restoreCheckboxState();

    // Chart.js sizes the canvas at construction time, but our Graph tab is
    // hidden (display:none) on page load, so the canvas reports 0x0 and
    // Chart.js draws into a zero-size buffer. When the user opens the
    // Graph tab, the canvas becomes visible but the chart doesn't auto-
    // resize. Force a resize+update on tab activation, and again on next
    // animation frame so the layout has settled.
    document.querySelectorAll('.tab-btn[data-page="graph"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const nudge = () => {
                if (!chart) return;
                try { chart.resize(); chart.update('none'); } catch {}
            };
            setTimeout(nudge, 50);
            requestAnimationFrame(nudge);
        });
    });

})();
