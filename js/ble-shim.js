// ============================================================
// ble-shim.js — minimal runtime so js/ble.js runs standalone
// (outside index.html) on pages like labs/joystick-lab.html.
//
// js/ble.js was written for the main app. It references several
// globals declared in core.js + lang.js as BARE NAMES (e.g.
// `deviceNameEl`, `connectBtn`, `addLogLine`, `t`, `UART_SERVICE_UUID`).
// Bare-name resolution requires top-level `let`/`const` declarations
// in a classic script — IIFEs DO NOT work because their bindings are
// function-scoped.
//
// This file is therefore NOT wrapped in an IIFE.
//
// MUST load BEFORE js/ble.js.
// ============================================================

// ---- 1. UART service UUID (core.js declares this in main app) ----
const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';

// ---- 2. State globals ble.js mutates ----
// Top-level `let` so cross-script bare-name resolution works.
let btDevice    = null;
let btServer    = null;
let uartService = null;
let notifyChar  = null;
let writeChar   = null;
let isConnected = false;

// ---- 3. DOM stubs ble.js touches by bare name ----
// Object stubs (not null) so things like `connectBtn.disabled = true`
// don't throw before the real elements are bound. Real DOM elements
// are wired up in DOMContentLoaded below.
let connectBtn         = { disabled: false };
let disconnectBtn      = { disabled: false };
let connectionStatusEl = null;
let deviceNameEl       = null;
let serviceUuidEl      = null;
let rxCharUuidEl       = null;
let txCharUuidEl       = null;
let serialNumberEl     = null;

// ---- 4. Hook table — host page overrides these to redirect output ----
window.RobiBle = window.RobiBle || {
  onLog:    function (/* line, level */) {},
  onStatus: function (/* state, name */) {},
  onRxLine: function (/* line */)        {},
  onToast:  function (/* msg, level */)  {},
};

// ---- 5. Function stubs ble.js calls by bare name ----
function addLogLine(line, level) {
  window.RobiBle.onLog(line, level || 'info');
}
function setConnectionStatus(state) {
  isConnected = !!state;
  window.RobiBle.onStatus(!!state, btDevice && btDevice.name);
}
function showToast(msg, level) {
  window.RobiBle.onToast(msg, level || 'info');
}
function handleUartLine(line) {
  window.RobiBle.onRxLine(line);
}
// Tiny i18n fallback (lang.js's t() in the main app)
function t(key) {
  const dict = {
    log_web_bt_na:      'Web Bluetooth not available',
    log_requesting:     'Requesting device…',
    log_connecting:     'Connecting…',
    log_getting_uart:   'Fetching UART service…',
    log_getting_chars:  'Fetching characteristics…',
    log_connected:      'Connected.',
    log_reconnecting:   'Reconnecting…',
    log_reconnect_fail: 'Reconnect failed.',
    toast_reconnecting: 'Reconnecting',
  };
  return dict[key] || key;
}

// ---- 6. After DOM is ready, hook real elements (if the host page
//        provides them with these IDs). Otherwise the stubs above
//        keep ble.js happy. ----
document.addEventListener('DOMContentLoaded', function () {
  const grab = function (id) { return document.getElementById(id); };
  // Replace stubs with real elements only if the host provides them.
  const cb = grab('connectBtn');
  const db = grab('disconnectBtn');
  if (cb) connectBtn         = cb;
  if (db) disconnectBtn      = db;
  connectionStatusEl = grab('connectionStatus');
  deviceNameEl       = grab('deviceName');
  serviceUuidEl      = grab('serviceUuidDisplay');
  rxCharUuidEl       = grab('rxCharUuidDisplay');
  txCharUuidEl       = grab('txCharUuidDisplay');
  serialNumberEl     = grab('serialNumber');
});
