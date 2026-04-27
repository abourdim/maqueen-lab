// ============================================================
// maqueen-panel.js — wires the Maqueen Lite v4 sensor strip
//
// Runs ON TOP of bit-playground's existing UART layer.
// Listens for the new firmware's reply lines (LINE:l,r, DIST:cm,
// IR:code, ACC:x,y,z) and updates the strip in the page header.
// Polling buttons send #N LINE? / #N DIST? / #N IR? via the
// BLE scheduler (sequence-numbered, echo-confirmed).
// ============================================================

(function () {
  'use strict';

  // ---- DOM refs (resolved on init) ----
  let elLineL, elLineR, elDist, elIR, elAcc, elBench;

  // ---- handlers ----
  function setLineSensors(l, r) {
    if (!elLineL) return;
    elLineL.style.background = l == 0 ? '#1d3556' : '#4ade80';
    elLineL.style.boxShadow = l == 0 ? 'none' : '0 0 8px #4ade80';
    elLineR.style.background = r == 0 ? '#1d3556' : '#4ade80';
    elLineR.style.boxShadow = r == 0 ? 'none' : '0 0 8px #4ade80';
  }

  function setDistance(cm) {
    if (!elDist) return;
    cm = +cm;
    // 500 = pxt-maqueen's no-echo / no-sensor sentinel; 0 = bad read
    if (cm <= 0 || cm >= 500) {
      elDist.textContent = '— cm';
      elDist.style.color = '#93a8c4';
      return;
    }
    elDist.textContent = cm + ' cm';
    elDist.style.color = cm < 10 ? '#f87171'
                       : cm < 30 ? '#fbbf24'
                       : '#4ade80';
  }

  function setIR(code) {
    if (!elIR) return;
    elIR.textContent = code;
    // brief flash on update
    elIR.animate(
      [{ opacity: 0.3 }, { opacity: 1 }],
      { duration: 250 }
    );
  }

  function setAcc(x, y, z) {
    if (!elAcc) return;
    elAcc.textContent = `${x}, ${y}, ${z}`;
  }

  function setBench(s) {
    if (!elBench) return;
    elBench.textContent =
      `${s.echoed}/${s.sent}` +
      (s.lost > 0 ? ` · ${s.lost} lost` : '') +
      ' · ' + (s.avgLatencyMs ? s.avgLatencyMs + ' ms' : '— ms');
    if (s.lost > 0) elBench.style.color = '#f87171';
    else if (s.echoed > 0) elBench.style.color = '#4ade80';
  }

  // ---- parse incoming lines from scheduler 'reply' events ----
  function onReply({ line }) {
    if (!line) return;
    let m;
    if ((m = line.match(/^LINE:(\d+),(\d+)$/))) {
      setLineSensors(+m[1], +m[2]);
    } else if (line === 'DIST:-') {
      setDistance(0); // firmware reports no echo / out of range
    } else if ((m = line.match(/^DIST:(\d+(?:\.\d+)?)$/))) {
      setDistance(m[1]);
    } else if ((m = line.match(/^IR:(\d+)$/))) {
      setIR(m[1]);
    } else if ((m = line.match(/^ACC:(-?\d+),(-?\d+),(-?\d+)$/))) {
      setAcc(m[1], m[2], m[3]);
    }
  }

  // ---- polling buttons (send via scheduler) ----
  function sendVerb(verb) {
    if (!window.bleScheduler) return;
    if (!window.bleScheduler.isConnected()) {
      // Quietly no-op when disconnected — avoids spamming TX-blocked logs
      return;
    }
    window.bleScheduler.send(verb).catch(err => {
      console.warn('[maqueen-panel]', verb, err.message);
    });
  }

  // ---- init ----
  function init() {
    elLineL = document.getElementById('mq-line-l');
    elLineR = document.getElementById('mq-line-r');
    elDist  = document.getElementById('mq-dist');
    elIR    = document.getElementById('mq-ir');
    elAcc   = document.getElementById('mq-acc');
    elBench = document.getElementById('mq-bench');

    if (!elLineL) return;   // panel not on this page

    document.getElementById('mq-poll-line').addEventListener('click', () => sendVerb('LINE?'));
    document.getElementById('mq-poll-dist').addEventListener('click', () => sendVerb('DIST?'));
    document.getElementById('mq-poll-ir').addEventListener('click',   () => sendVerb('IR?'));

    // ---- streams toggle (ACC / TEMP / LIGHT / COMPASS / BTN) -------
    // Off by default in firmware to keep BLE channel free for command verbs.
    // Toggle on when the user wants the legacy Sensors / Graph / 3D tabs to
    // show live data.
    let streamsOn = false;
    const streamsBtn = document.getElementById('mq-streams-toggle');
    function paintStreamsBtn() {
      if (!streamsBtn) return;
      streamsBtn.textContent = 'streams: ' + (streamsOn ? 'ON' : 'OFF');
      streamsBtn.style.color = streamsOn ? '#4ade80' : '#fbbf24';
      streamsBtn.style.borderColor = streamsOn ? '#4ade80' : '#fbbf24';
    }
    function clearStaleStreamReadouts() {
      if (elAcc)   elAcc.textContent = '—, —, —';
      if (elIR)    elIR.textContent  = '—';
    }
    function clearStalePollReadouts() {
      // Called when leaving Maqueen tab — line/dist polls are paused so
      // their last values are stale.
      if (elDist)  { elDist.textContent = '— cm'; elDist.style.color = '#93a8c4'; }
      if (elLineL) { elLineL.style.background = '#1d3556'; elLineL.style.boxShadow = 'none'; }
      if (elLineR) { elLineR.style.background = '#1d3556'; elLineR.style.boxShadow = 'none'; }
    }
    function setStreams(on) {
      if (streamsOn === on) return;
      if (!window.bleScheduler || !window.bleScheduler.isConnected()) return;
      streamsOn = on;
      sendVerb(on ? 'STREAM:on' : 'STREAM:off');
      paintStreamsBtn();
      if (!on) clearStaleStreamReadouts();
    }
    if (streamsBtn) {
      streamsBtn.addEventListener('click', () => {
        if (!window.bleScheduler || !window.bleScheduler.isConnected()) {
          alert('Connect to the robot first.');
          return;
        }
        setStreams(!streamsOn);
      });
      paintStreamsBtn();
    }

    // Auto-enable streams when the user enters a stream-dependent tab,
    // auto-disable when they leave it. Keeps the BLE channel free during
    // command-heavy work on the Maqueen tab without forcing a manual click.
    const STREAM_TABS = ['senses', 'graph', 'board3d'];
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = btn.getAttribute('data-page');
        // small delay so .active class flip / TAB: send happen first
        setTimeout(() => {
          setStreams(STREAM_TABS.indexOf(page) !== -1);
          // Leaving Maqueen tab pauses the LINE/DIST pollers — clear
          // their last-shown values so the strip doesn't lie about
          // currently-flowing data.
          if (page !== 'maqueen') clearStalePollReadouts();
        }, 30);
      });
    });

    if (window.bleScheduler) {
      window.bleScheduler.on('reply', onReply);
      window.bleScheduler.on('stats', setBench);
    } else {
      console.warn('[maqueen-panel] bleScheduler not loaded');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
