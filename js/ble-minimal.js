// ============================================================
// ble-minimal.js — Standalone Web Bluetooth UART for Maqueen Lab
//
// Self-contained connect / send / receive. NOT bit-playground's
// js/ble.js (which is preserved unchanged for the legacy index).
// Provides the same global names (sendLine, handleUartLine,
// addLogLine, isConnected) so ble-scheduler.js works against
// either implementation.
// ============================================================

(function (global) {
  'use strict';

  const UART_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
  const UART_TX_CHAR = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';   // write (web → bit)
  const UART_RX_CHAR = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';   // notify (bit → web)
  const MTU = 20;

  let device = null, server = null, writeChar = null, notifyChar = null;
  let connected = false;
  const logEl = () => document.getElementById('ble-log');

  function addLogLine(text, kind) {
    const el = logEl();
    if (!el) { console.log(`[ble:${kind}] ${text}`); return; }
    const div = document.createElement('div');
    div.className = `log-line log-${kind || 'info'}`;
    const ts = new Date().toLocaleTimeString();
    div.textContent = `${ts}  ${text}`;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
    while (el.children.length > 500) el.removeChild(el.firstChild);
  }
  global.addLogLine = addLogLine;

  function setStatus(s) {
    const dot = document.getElementById('ble-status');
    const txt = document.getElementById('ble-status-text');
    if (dot) dot.className = `status-dot status-${s}`;
    if (txt) txt.textContent =
      s === 'connected' ? 'Connected' :
      s === 'connecting' ? 'Connecting…' : 'Disconnected';
  }

  async function connect() {
    if (connected) { disconnect(); return; }
    setStatus('connecting');
    try {
      device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'BBC micro:bit' },
          { namePrefix: 'uBit' },
        ],
        optionalServices: [UART_SERVICE],
      });
      device.addEventListener('gattserverdisconnected', onDisconnect);
      addLogLine('Pairing with ' + device.name, 'info');
      server = await device.gatt.connect();
      const svc = await server.getPrimaryService(UART_SERVICE);
      const chars = await svc.getCharacteristics();
      for (const c of chars) {
        const id = c.uuid.toLowerCase();
        if (id === UART_TX_CHAR) writeChar = c;
        if (id === UART_RX_CHAR) notifyChar = c;
      }
      if (!writeChar || !notifyChar) throw new Error('UART characteristics not found');
      await notifyChar.startNotifications();
      notifyChar.addEventListener('characteristicvaluechanged', onNotification);
      connected = true;
      setStatus('connected');
      addLogLine('Connected', 'ok');
      // Identify firmware
      sendLine('HELLO');
    } catch (e) {
      addLogLine('Connect failed: ' + e.message, 'err');
      setStatus('disconnected');
    }
  }

  function disconnect() {
    if (device && device.gatt && device.gatt.connected) device.gatt.disconnect();
    onDisconnect();
  }

  function onDisconnect() {
    connected = false;
    writeChar = null;
    notifyChar = null;
    setStatus('disconnected');
    addLogLine('Disconnected', 'warn');
  }

  function onNotification(ev) {
    const dv = ev.target.value;
    let text = '';
    for (let i = 0; i < dv.byteLength; i++) text += String.fromCharCode(dv.getUint8(i));
    text.split(/\r?\n/).forEach(line => {
      if (line.trim()) global.handleUartLine(line);
    });
  }

  // Default UART line handler — logs to console; scheduler wraps this
  global.handleUartLine = global.handleUartLine || function (line) {
    addLogLine('RX  ' + line, 'rx');
  };

  function sendLine(line) {
    if (!writeChar || !connected) {
      addLogLine('TX blocked (not connected): ' + line, 'err');
      return;
    }
    const enc = new TextEncoder();
    const data = enc.encode(line + '\n');
    if (data.byteLength <= MTU) {
      writeChar.writeValue(data)
        .then(() => addLogLine('TX  ' + line, 'tx'))
        .catch(err => addLogLine('TX error: ' + err, 'err'));
    } else {
      let chain = Promise.resolve();
      for (let off = 0; off < data.byteLength; off += MTU) {
        const chunk = data.slice(off, Math.min(off + MTU, data.byteLength));
        chain = chain.then(() => writeChar.writeValue(chunk));
      }
      chain.then(() => addLogLine('TX  ' + line + ' (chunked)', 'tx'))
           .catch(err => addLogLine('TX error: ' + err, 'err'));
    }
  }
  global.sendLine = sendLine;
  global.isConnected = () => connected;

  // Wire connect button on DOM ready
  function bindUi() {
    const btn = document.getElementById('ble-connect-btn');
    if (btn) btn.addEventListener('click', connect);
    setStatus('disconnected');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindUi);
  else bindUi();
})(window);
