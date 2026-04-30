// ============================================================
// core.js — Event bus, DOM helpers, logging, toasts, shortcuts
// ============================================================

// Simple event bus for connection state
const connectionEvents = new EventTarget();
function emitConnectionChange(connected) {
    connectionEvents.dispatchEvent(new CustomEvent('change', { detail: { connected } }));
}

const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';

// Shorthand
const $ = id => document.getElementById(id);

// Connection / UI elements
const connectionStatusEl = $('connectionStatus');
const connectBtn         = $('connectBtn');
const disconnectBtn      = $('disconnectBtn');
const deviceNameEl       = $('deviceName');
const serviceUuidEl      = $('serviceUuidDisplay');
const rxCharUuidEl       = $('rxCharUuidDisplay');
const txCharUuidEl       = $('txCharUuidDisplay');
const serialNumberEl     = $('serialNumber');

// Log
const logEl        = $('log');
const clearLogBtn  = $('clearLogBtn');
const exportLogBtn = $('exportLogBtn');

// Mode & tabs
const beginnerModeBtn = $('beginnerModeBtn');
const expertModeBtn   = $('expertModeBtn');
const appRoot         = document.querySelector('.app');
const tabButtons      = document.querySelectorAll('.tab-btn');
const tabPages        = document.querySelectorAll('.tab-page');

// Controls
const textInput         = $('textInput');
const sendTextBtn       = $('sendTextBtn');
const customJsonInput   = $('customJsonInput');
const sendCustomJsonBtn = $('sendCustomJsonBtn');

// LED
const ledMatrixEl       = $('ledMatrix');
const sendLedPatternBtn = $('sendLedPatternBtn');
const clearMatrixBtn    = $('clearMatrixBtn');
const presetButtons     = document.querySelectorAll('.chip-btn[data-preset]');
const cmdButtons        = document.querySelectorAll('[data-cmd]');

// Sensor value elements (used by sensors.js)
const tempValueEl   = $('tempValue');
const lightValueEl  = $('lightValue');
const soundValueEl  = $('soundValue');
const motionValueEl = $('motionValue');
const accelXValueEl = $('accelXValue');
const accelYValueEl = $('accelYValue');
const accelZValueEl = $('accelZValue');
// Note: compassHeadingValueEl, btnA/B state, touch state elements
// are declared in sensors.js which owns the UART parsing

// BLE state
let btDevice   = null;
let btServer   = null;
let uartService= null;
let notifyChar = null;
let writeChar  = null;
let isConnected= false;

// ==================== TOAST NOTIFICATIONS ====================

const toastContainer = (() => {
    const el = document.createElement('div');
    el.id = 'toastContainer';
    el.className = 'toast-container';
    document.body.appendChild(el);
    return el;
})();

/**
 * Show a toast notification
 * @param {string} message  Text to show
 * @param {string} type     'success' | 'error' | 'info' | 'warning'
 * @param {number} duration ms before auto-dismiss (default 3000)
 */
function showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    toast.innerHTML = '<span class="toast-icon">' + (icons[type] || 'ℹ️') + '</span><span class="toast-msg">' + message + '</span>';
    toastContainer.appendChild(toast);
    // Trigger enter animation
    requestAnimationFrame(() => toast.classList.add('toast-show'));
    // Auto dismiss
    setTimeout(() => {
        toast.classList.remove('toast-show');
        toast.classList.add('toast-hide');
        setTimeout(() => toast.remove(), 400);
    }, duration);
}

// ==================== KEYBOARD SHORTCUTS ====================

const shortcutHelp = {
    'Space': 'Connect / Disconnect',
    '1–7': 'Switch tabs',
    'P': 'Pause graph',
    'F': 'Fullscreen graph',
    'K': 'Toggle shortcuts help',
    'Escape': 'Close overlays'
};

document.addEventListener('keydown', (e) => {
    // Don't intercept when typing in inputs
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    // Space = connect/disconnect
    if (e.code === 'Space') {
        e.preventDefault();
        if (isConnected) { if (typeof disconnect === 'function') disconnect(); }
        else { if (typeof connect === 'function') connect(); }
        return;
    }

    // 1-8 = switch tabs
    const tabKeys = ['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8'];
    const tabIdx = tabKeys.indexOf(e.code);
    if (tabIdx >= 0) {
        const visibleTabs = Array.from(tabButtons).filter(b => {
            return !b.classList.contains('expert-only') || !appRoot?.classList.contains('beginner-mode');
        });
        if (visibleTabs[tabIdx]) {
            visibleTabs[tabIdx].click();
            return;
        }
    }

    // P = pause graph
    if (e.code === 'KeyP') {
        const pauseBtn = $('graphPauseBtn');
        if (pauseBtn) pauseBtn.click();
        return;
    }

    // F = fullscreen graph
    if (e.code === 'KeyF') {
        const fsBtn = $('graphFullscreenBtn');
        if (fsBtn) fsBtn.click();
        return;
    }

    // K = show shortcuts help
    if (e.code === 'KeyK') {
        const overlay = $('shortcutsOverlay');
        if (overlay) overlay.classList.toggle('visible');
        return;
    }

    // Escape = close overlays
    if (e.code === 'Escape') {
        document.querySelectorAll('.overlay.visible').forEach(o => o.classList.remove('visible'));
        return;
    }
});

// ==================== LOGGING ====================

function addLogLine(text, kind = 'info') {
    if (!logEl) return;
    const d = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.className = 'log-' + kind;
    line.textContent = `[${d}] ${text}`;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
    // Cap at 500 entries to prevent memory growth in long sessions
    while (logEl.children.length > 500) {
        logEl.removeChild(logEl.firstChild);
    }
}

function clearLog() {
    if (logEl) logEl.innerHTML = '';
}

function exportLog() {
    if (!logEl) return;
    const text = logEl.innerText;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'microbit_log.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ==================== CONNECTION STATUS ====================

function setConnectionStatus(connected) {
    isConnected = connected;

    if (connectBtn)    connectBtn.disabled    = connected;
    if (disconnectBtn) disconnectBtn.disabled = !connected;

    // Toast notification
    if (connected) {
        showToast(t('toast_connected'), 'success');
    } else {
        showToast(t('toast_disconnected'), 'error');
    }

    // Notify all listeners (servos, etc.)
    emitConnectionChange(connected);

    if (!connectionStatusEl) return;
    const dot  = connectionStatusEl.querySelector('.status-dot');
    const text = connectionStatusEl.querySelector('span:last-child');
    if (connected) {
        connectionStatusEl.classList.add('connected');
        connectionStatusEl.classList.remove('disconnected');
        if (text) text.textContent = t('status_connected');
    } else {
        connectionStatusEl.classList.remove('connected');
        connectionStatusEl.classList.add('disconnected');
        if (text) text.textContent = t('status_disconnected');
    }
}

// Alias for sendLine (used by servo module)
function writeUART(line) {
    sendLine(line);
}

// ==================== ACTIVITY FEED ====================

const activityFeed = document.getElementById('activity');
const clearActivityBtn = document.getElementById('clearActivityBtn');

function addActivity(message, type = 'info') {
    if (!activityFeed) return;
    const item = document.createElement('div');
    item.className = 'activity-item ' + type;
    item.textContent = message;
    activityFeed.appendChild(item);
    activityFeed.scrollTop = activityFeed.scrollHeight;

    // Keep only last 20 items
    while (activityFeed.children.length > 20) {
        activityFeed.removeChild(activityFeed.firstChild);
    }
}

clearActivityBtn?.addEventListener('click', () => {
    if (activityFeed) activityFeed.innerHTML = '';
});
