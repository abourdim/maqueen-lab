// ============================================================
// ble.js — Bluetooth connection, UART send/receive, reconnect
// ============================================================

// ------------ Sending over UART (with chunking) ------------

const BLE_MTU_PAYLOAD = 20; // typical BLE ATT payload limit

// Returns the writeValue() Promise so callers (notably the maqueen-lab
// scheduler in js/ble-scheduler.js) can serialize properly by awaiting
// completion. Web Bluetooth's GATT only allows one writeValue at a time,
// so without an awaitable Promise the scheduler can only guess timing,
// which leads to 'NetworkError: GATT operation already in progress'.
// Bit-playground callers that don't care can simply ignore the return.
function sendLine(line) {
    if (!writeChar || !isConnected) {
        addLogLine('TX blocked (not connected) > ' + line, 'error');
        return Promise.resolve();
    }
    const enc = new TextEncoder();
    const data = enc.encode(line + '\n');

    if (data.byteLength <= BLE_MTU_PAYLOAD) {
        // Fits in one write
        return writeChar.writeValue(data)
            .then(() => addLogLine('TX > ' + line, 'tx'))
            .catch(err => addLogLine('TX error: ' + err, 'error'));
    } else {
        // Chunk into BLE_MTU_PAYLOAD-sized pieces
        let offset = 0;
        const chunks = [];
        while (offset < data.byteLength) {
            const end = Math.min(offset + BLE_MTU_PAYLOAD, data.byteLength);
            chunks.push(data.slice(offset, end));
            offset = end;
        }
        // Send chunks sequentially
        let chain = Promise.resolve();
        chunks.forEach((chunk, i) => {
            chain = chain.then(() => writeChar.writeValue(chunk));
        });
        return chain
            .then(() => addLogLine('TX > ' + line + ' (' + chunks.length + ' chunks)', 'tx'))
            .catch(err => addLogLine('TX error: ' + err, 'error'));
    }
}

// Attach listeners to all tab buttons — notify micro:bit on every change
// (firmware uses currentTab for LED feedback, BENCH:STATUS, and pin management)
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const page = btn.getAttribute("data-page");
    sendLine(`TAB:${page}`);
  });
});

// ------------ UART RX notification ------------

function onUartNotification(event) {
    const dv = event.target.value;
    let text = '';
    for (let i = 0; i < dv.byteLength; i++) {
        text += String.fromCharCode(dv.getUint8(i));
    }
    text.split(/\r?\n/).forEach(line => {
        if (line.trim()) handleUartLine(line);
    });
}

// ------------ Bluetooth connect/disconnect ------------

let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 2000;
let userDisconnected = false; // flag to distinguish manual vs unexpected disconnect

async function attemptReconnect() {
    if (userDisconnected || !btDevice || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            addLogLine(t('log_reconnect_fail'), 'error');
            if (typeof addActivity === 'function') {
                addActivity('⚠️ Could not reconnect. Try again!', 'info');
            }
        }
        reconnectAttempts = 0;
        return;
    }

    reconnectAttempts++;
    addLogLine(t('log_reconnecting') + ' (' + reconnectAttempts + '/' + MAX_RECONNECT_ATTEMPTS + ')...', 'info');
    if (typeof showToast === 'function') {
        showToast(t('toast_reconnecting') + ' (' + reconnectAttempts + '/' + MAX_RECONNECT_ATTEMPTS + ')', 'warning');
    }
    if (typeof addActivity === 'function') {
        addActivity('🔄 Reconnecting... (' + reconnectAttempts + '/' + MAX_RECONNECT_ATTEMPTS + ')', 'info');
    }

    await new Promise(r => setTimeout(r, RECONNECT_DELAY_MS));

    try {
        btServer = await btDevice.gatt.connect();
        uartService = await btServer.getPrimaryService(UART_SERVICE_UUID);
        const chars = await uartService.getCharacteristics();

        let c2 = null, c3 = null;
        for (const ch of chars) {
            const id = ch.uuid.toLowerCase();
            if (id.includes('6e400002')) c2 = ch;
            else if (id.includes('6e400003')) c3 = ch;
        }

        const isNotifier = ch => ch && (ch.properties.notify || ch.properties.indicate);
        const isWriter   = ch => ch && (ch.properties.write || ch.properties.writeWithoutResponse);

        notifyChar = isNotifier(c3) ? c3 : null;
        writeChar  = isWriter(c2) ? c2 : null;

        if (!notifyChar || !writeChar) {
            for (const ch of chars) {
                if (!notifyChar && isNotifier(ch)) notifyChar = ch;
                if (!writeChar && isWriter(ch))    writeChar  = ch;
            }
        }

        if (!notifyChar || !writeChar) {
            addLogLine('Reconnect: characteristics not found', 'error');
            attemptReconnect();
            return;
        }

        await notifyChar.startNotifications();
        notifyChar.addEventListener('characteristicvaluechanged', onUartNotification);

        setConnectionStatus(true);
        reconnectAttempts = 0;
        addLogLine(t('log_reconnected'), 'success');
        sendLine('HELLO');
    } catch (err) {
        addLogLine('Reconnect failed: ' + err, 'error');
        attemptReconnect();
    }
}

async function connect() {
    try {
        userDisconnected = false;
        reconnectAttempts = 0;
        if (!navigator.bluetooth) {
            addLogLine(t('log_web_bt_na'), 'error');
            return;
        }

        connectBtn.disabled = true;
        addLogLine(t('log_requesting'), 'info');

        btDevice = await navigator.bluetooth.requestDevice({
            filters: [
                { namePrefix: 'BBC micro:bit' },
                { namePrefix: 'BBC Micro:Bit' },
                { namePrefix: 'uBit' },
                { namePrefix: 'Ubit' },
                { namePrefix: 'micro:bit' },
                { namePrefix: 'Micro:Bit' },
                { services: [UART_SERVICE_UUID] }
            ],
            optionalServices: [UART_SERVICE_UUID]
        });

        btDevice.addEventListener('gattserverdisconnected', () => {
            addLogLine('Device disconnected unexpectedly', 'error');
            setConnectionStatus(false);
            attemptReconnect();
        });

        addLogLine(t('log_connecting'), 'info');
        btServer = await btDevice.gatt.connect();

        addLogLine(t('log_getting_uart'), 'info');
        uartService = await btServer.getPrimaryService(UART_SERVICE_UUID);

        addLogLine(t('log_getting_chars'), 'info');
        const chars = await uartService.getCharacteristics();
        notifyChar = null;
        writeChar  = null;

        // Prefer Nordic UART RX/TX IDs
        let c2 = null, c3 = null;
        for (const ch of chars) {
            const id = ch.uuid.toLowerCase();
            if (id.includes('6e400002')) c2 = ch; // RX (write)
            else if (id.includes('6e400003')) c3 = ch; // TX (notify)
        }

        const isNotifier = ch => ch && (ch.properties.notify || ch.properties.indicate);
        const isWriter   = ch => ch && (ch.properties.write || ch.properties.writeWithoutResponse);

        if (isNotifier(c3)) notifyChar = c3;
        if (isWriter(c2))   writeChar  = c2;

        // Fallback: first notify + first write
        if (!notifyChar || !writeChar) {
            for (const ch of chars) {
                if (!notifyChar && isNotifier(ch)) notifyChar = ch;
                if (!writeChar && isWriter(ch))    writeChar  = ch;
            }
        }

        if (!notifyChar || !writeChar) {
            addLogLine('UART characteristics not found (no notify/write pair)', 'error');
            setConnectionStatus(false);
            connectBtn.disabled = false;
            return;
        }

        await notifyChar.startNotifications();
        notifyChar.addEventListener('characteristicvaluechanged', onUartNotification);

        if (deviceNameEl && btDevice.name) deviceNameEl.textContent = btDevice.name;
        if (serviceUuidEl) serviceUuidEl.textContent = UART_SERVICE_UUID;
        if (rxCharUuidEl)  rxCharUuidEl.textContent  = writeChar.uuid;
        if (txCharUuidEl)  txCharUuidEl.textContent  = notifyChar.uuid;

        setConnectionStatus(true);
        addLogLine(t('log_connected'), 'success');

        // Hello to firmware
        sendLine('HELLO');
    } catch (err) {
        console.error(err);
        addLogLine('Connection failed: ' + err, 'error');
        setConnectionStatus(false);
        connectBtn.disabled = false;
    }
}

async function disconnect() {
    userDisconnected = true; // prevent auto-reconnect
    try {
        if (notifyChar) {
            try { await notifyChar.stopNotifications(); } catch {}
        }
        if (btDevice && btDevice.gatt && btDevice.gatt.connected) {
            btDevice.gatt.disconnect();
        }
    } catch (e) {
        console.error(e);
    } finally {
        addLogLine(t('log_disconnected'), 'info');
        setConnectionStatus(false);
        connectBtn.disabled = false;
    }
}
