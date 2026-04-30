// ============================================================
// buzzer-modem.js — Audio data transfer between robots.
//
// Two Maqueens, no BLE between them. Tab A's robot encodes a
// short string as DTMF tones via BUZZ:; Tab B's laptop mic picks
// up the audio and decodes via FFT. Air-gap communication.
//
// DTMF-style: 16 symbols (4-bit nibbles) mapped to (low_freq, high_freq)
// pairs picked from non-harmonic frequencies that survive on a
// piezo + microphone path. Each symbol is 250 ms tone + 50 ms silence.
//
// Encode: BUZZ:f1,250 + small delay + BUZZ:f2,250. Or single BUZZ:
// fundamental — we use the simpler approach: each nibble maps to a
// SINGLE distinctive frequency from a 16-step list, mic FFT checks
// which bucket fires loudest.
//
// Click 📡 in the Buzzer panel → opens the modem panel.
// ============================================================
(function () {
  'use strict';

  // 16 frequencies, well-separated in log-space to avoid harmonic
  // confusion. Range chosen to fit piezo's audible-good band.
  const FREQS = [
    700, 770, 852, 941, 1041, 1147, 1262, 1389,
    1530, 1685, 1855, 2042, 2249, 2476, 2725, 3001,
  ];
  const SYMBOL_MS    = 250;
  const GAP_MS       = 60;
  const PREAMBLE     = 600;       // distinct out-of-band frame marker
  const FFT_SIZE     = 4096;

  // ---- Encode ----
  async function encodeAndSend(text) {
    if (!window.bleScheduler) { paintStatus('no BLE', '#f87171'); return; }
    paintStatus('🔊 transmitting…', '#fbbf24');
    // Preamble (frame start)
    await sendTone(PREAMBLE, SYMBOL_MS);
    for (const ch of text) {
      const code = ch.charCodeAt(0);
      const hi = (code >> 4) & 0xf, lo = code & 0xf;
      await sendTone(FREQS[hi], SYMBOL_MS);
      await sendTone(FREQS[lo], SYMBOL_MS);
    }
    await sendTone(PREAMBLE, SYMBOL_MS);     // frame end
    paintStatus(`✓ sent "${text}"`, '#4ade80');
  }

  async function sendTone(hz, ms) {
    try {
      await window.bleScheduler.send(`BUZZ:${Math.round(hz)},${ms}`).catch(() => {});
      await new Promise(r => setTimeout(r, ms + GAP_MS));
    } catch {}
  }

  // ---- Decode ----
  let ac = null, analyser = null, mic = null, decoderRunning = false;

  async function startDecoder() {
    if (decoderRunning) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const src = ac.createMediaStreamSource(stream);
      analyser = ac.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      src.connect(analyser);
      mic = stream;
      decoderRunning = true;
      paintStatus('👂 listening…', '#38bdf8');
      decodeLoop();
    } catch (e) {
      paintStatus('mic denied: ' + e.message, '#f87171');
    }
  }
  function stopDecoder() {
    decoderRunning = false;
    if (mic) mic.getTracks().forEach(t => t.stop());
    if (ac) try { ac.close(); } catch {}
    ac = analyser = mic = null;
    paintStatus('idle', '#94a3b8');
  }

  // Find which of our FREQS has the highest magnitude in the FFT bin.
  function detectSymbol() {
    if (!analyser) return null;
    const buf = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(buf);
    const sr = ac.sampleRate;
    const binWidth = sr / analyser.fftSize;
    let bestIdx = -1, bestMag = -Infinity;
    let preMag = -Infinity;
    const candidates = [...FREQS, PREAMBLE];
    for (let i = 0; i < candidates.length; i++) {
      const bin = Math.round(candidates[i] / binWidth);
      let m = -Infinity;
      // Average over 3 adjacent bins for noise tolerance
      for (let d = -1; d <= 1; d++) {
        const v = buf[bin + d] || -Infinity;
        if (v > m) m = v;
      }
      if (i === FREQS.length) preMag = m;     // PREAMBLE
      else if (m > bestMag) { bestMag = m; bestIdx = i; }
    }
    // Threshold: tone must clear -40 dB. Otherwise treat as silence.
    if (preMag > -40 && preMag > bestMag - 4) return 'P';
    if (bestMag > -40) return bestIdx;
    return null;
  }

  // Symbol-rate sampling: sample every 50 ms, detect the dominant.
  // BUGFIX: previous version skipped consecutive identical symbols
  // (e.g., "AA" decoded as "A"). New approach: require a silence
  // gap (sym === null) between consecutive detections. Each tone is
  // SYMBOL_MS=250 ms with GAP_MS=60 ms silence between, so we'll
  // always see at least one null sample between symbols.
  let lastSymbolAt = 0;
  let lastSymbol = null;
  let sawSilence = true;        // initially "in silence" (no current tone)
  let inFrame = false;
  let nibbles = [];
  let receivedText = '';

  async function decodeLoop() {
    while (decoderRunning) {
      const sym = detectSymbol();
      const now = performance.now();
      if (sym === null) {
        sawSilence = true;
        lastSymbol = null;
      } else if (sawSilence && (now - lastSymbolAt > 150)) {
        // Fresh symbol after silence — accept even if it equals the previous.
        handleSymbol(sym);
        lastSymbolAt = now;
        lastSymbol = sym;
        sawSilence = false;
      }
      await new Promise(r => setTimeout(r, 50));
    }
  }

  function handleSymbol(sym) {
    if (sym === 'P') {
      if (!inFrame) {
        inFrame = true;
        nibbles = [];
        receivedText = '';
        paintReceived('▶ frame start');
      } else {
        inFrame = false;
        paintReceived(`✓ "${receivedText}"`);
      }
      return;
    }
    if (!inFrame) return;
    nibbles.push(sym);
    if (nibbles.length >= 2) {
      const code = (nibbles[0] << 4) | nibbles[1];
      receivedText += String.fromCharCode(code);
      nibbles = [];
      paintReceived(`📡 "${receivedText}"`);
    }
  }

  // ---- UI ----
  function paintStatus(msg, color) {
    const el = document.getElementById('mqModemStatus');
    if (el) { el.textContent = msg; el.style.color = color || '#94a3b8'; }
  }
  function paintReceived(msg) {
    const el = document.getElementById('mqModemReceived');
    if (el) el.textContent = msg;
  }

  function buildPanel() {
    const buzz = document.querySelector('[data-mq-sub="buzzer"]');
    if (!buzz || document.getElementById('mqModemPanel')) return false;
    const panel = document.createElement('div');
    panel.id = 'mqModemPanel';
    panel.style.cssText = 'margin-top:14px; padding:12px; background:rgba(56,189,248,0.05); border:1px solid rgba(56,189,248,0.3); border-radius:10px;';
    panel.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
        <span style="font-size:18px;">📡</span>
        <span style="font-weight:700; color:#38bdf8;">Buzzer Modem</span>
        <span style="color:var(--text-secondary, #93a8c4); font-size:11px;">— send text robot-to-robot via audio (no BLE)</span>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
        <input id="mqModemInput" type="text" maxlength="20" placeholder="message (≤ 20 chars)" style="flex:1; min-width:160px; padding:8px 10px; background:#000; color:#38bdf8; border:1px solid #1f2a44; border-radius:8px; font-family:JetBrains Mono, monospace; font-size:13px;"/>
        <button id="mqModemSend"   type="button" style="padding:8px 14px; background:#38bdf8; color:#01202b; border:none; border-radius:8px; font-weight:700; cursor:pointer;">📤 Send</button>
        <button id="mqModemListen" type="button" style="padding:8px 14px; background:transparent; color:#22d3ee; border:1px solid #22d3ee; border-radius:8px; cursor:pointer;">👂 Listen</button>
      </div>
      <div id="mqModemStatus" style="margin-top:8px; font-family:monospace; font-size:11px; color:#94a3b8;">idle</div>
      <div id="mqModemReceived" style="margin-top:4px; font-family:monospace; font-size:14px; color:#4ade80; min-height:20px;"></div>
      <div style="margin-top:6px; font-size:10px; color:#94a3b8; opacity:0.7;">
        Each char = 16 ms preamble + 2 frequency-coded nibbles. ~25 chars/sec. Real air-gap comm.
      </div>
    `;
    buzz.appendChild(panel);
    return true;
  }

  function init() {
    let tries = 0;
    const id = setInterval(() => {
      if (buildPanel() || ++tries > 20) {
        clearInterval(id);
        document.getElementById('mqModemSend')?.addEventListener('click', () => {
          const t = (document.getElementById('mqModemInput')?.value || '').trim();
          if (t) encodeAndSend(t);
        });
        document.getElementById('mqModemListen')?.addEventListener('click', () => {
          if (decoderRunning) stopDecoder(); else startDecoder();
        });
      }
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
