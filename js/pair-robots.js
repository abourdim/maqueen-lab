// ============================================================
// pair-robots.js — Two browser tabs, one drives the other.
//
// Manual-signaling WebRTC: no server. Three-step UI:
//   A · create offer           (Tab A → SDP1 in textarea)
//   B · paste offer & answer   (Tab B pastes SDP1, returns SDP2)
//   A · paste answer           (Tab A pastes SDP2 → connected)
//
// Once the data channel is open, every M:L,R / STOP / SRV: / RGB:
// command going through window.bleScheduler.send is mirrored to
// the peer, who relays it to their own bleScheduler. The receiver
// can drive their own robot independently — pairing is one-way
// (sender → receiver) for clarity. Tab A is always the driver.
//
// We bundle ICE candidates by waiting for `iceGatheringState ===
// 'complete'` so the SDP we paste already contains everything;
// no trickle-ICE plumbing.
// ============================================================
(function () {
  'use strict';

  let pc      = null;
  let dc      = null;
  let role    = null;       // 'A' (driver) | 'B' (mirror)

  function status(msg, color) {
    const el = document.getElementById('mqPairStatus');
    if (!el) return;
    el.textContent = msg;
    el.style.color = color || 'var(--text-secondary, #93a8c4)';
  }
  function box() { return document.getElementById('mqPairBox'); }

  function freshPC() {
    pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    pc.onconnectionstatechange = () => {
      status('WebRTC: ' + pc.connectionState,
        pc.connectionState === 'connected' ? '#4ade80' :
        pc.connectionState === 'failed'    ? '#f87171' :
        '#fbbf24');
    };
  }

  // Wait until ICE candidates are fully gathered.
  function awaitIce(_pc) {
    return new Promise(resolve => {
      if (_pc.iceGatheringState === 'complete') return resolve();
      function chk() {
        if (_pc.iceGatheringState === 'complete') {
          _pc.removeEventListener('icegatheringstatechange', chk);
          resolve();
        }
      }
      _pc.addEventListener('icegatheringstatechange', chk);
    });
  }

  // ---- Channel hookup -----------------------------------------
  function bindChannel(channel) {
    dc = channel;
    dc.onopen    = () => {
      status('✓ data channel open — drive away!', '#4ade80');
      // Hand the channel to fencing-mode for hit-broadcast.
      try { if (typeof window.mqFencingSetChannel === 'function') window.mqFencingSetChannel(dc); } catch {}
    };
    dc.onclose   = () => status('channel closed', 'var(--text-secondary, #93a8c4)');
    dc.onmessage = (e) => {
      const raw = String(e.data || '');
      // Cross-module routing: JSON-encoded events go to their handler;
      // plain text gets relayed as a BLE verb.
      if (raw.startsWith('{')) {
        try {
          const obj = JSON.parse(raw);
          // Fencing duel HIT messages → fencing-mode.js public hook.
          if (obj && obj.type === 'HIT' && typeof window.mqFencingTakeHit === 'function') {
            window.mqFencingTakeHit(obj);
            return;
          }
        } catch { /* fall through to BLE relay */ }
      }
      try {
        if (window.bleScheduler && window.bleScheduler.send) {
          window.bleScheduler.send(raw).catch(() => {});
        }
      } catch {}
    };
  }

  // ---- A: create offer ----------------------------------------
  async function createOffer() {
    role = 'A';
    freshPC();
    bindChannel(pc.createDataChannel('mq-pair'));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await awaitIce(pc);
    box().value = JSON.stringify(pc.localDescription);
    status('offer ready — give it to Tab B', '#38bdf8');
    // Hook scheduler so every send replicates to the peer.
    hookSendInterceptor();
  }

  // ---- B: paste offer & answer --------------------------------
  async function answerOffer() {
    role = 'B';
    freshPC();
    pc.ondatachannel = (e) => bindChannel(e.channel);
    let offer;
    try { offer = JSON.parse(box().value); }
    catch { status('paste the offer JSON first', '#f87171'); return; }
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await awaitIce(pc);
    box().value = JSON.stringify(pc.localDescription);
    status('answer ready — give it back to Tab A', '#c084fc');
  }

  // ---- A: paste answer ----------------------------------------
  async function acceptAnswer() {
    if (!pc) { status('create an offer first', '#f87171'); return; }
    let answer;
    try { answer = JSON.parse(box().value); }
    catch { status('paste the answer JSON first', '#f87171'); return; }
    await pc.setRemoteDescription(answer);
    status('connecting…', '#fbbf24');
  }

  // ---- send interceptor (Tab A only) --------------------------
  let interceptorHooked = false;
  function hookSendInterceptor() {
    if (interceptorHooked || !window.bleScheduler) return;
    interceptorHooked = true;
    const origSend = window.bleScheduler.send.bind(window.bleScheduler);
    window.bleScheduler.send = function (line, opts) {
      // Echo to peer (best-effort) without intercepting the local send.
      try {
        if (dc && dc.readyState === 'open') dc.send(line);
      } catch {}
      return origSend(line, opts);
    };
  }

  function open() {
    const m = document.getElementById('mqPairModal');
    if (m) m.style.display = 'flex';
  }
  function close() {
    const m = document.getElementById('mqPairModal');
    if (m) m.style.display = 'none';
  }

  function init() {
    if (typeof RTCPeerConnection === 'undefined') {
      // Hide button on browsers without WebRTC (rare).
      const btn = document.getElementById('mqPairBtn');
      if (btn) btn.style.display = 'none';
      return;
    }
    document.getElementById('mqPairBtn').addEventListener('click', open);
    document.getElementById('mqPairClose').addEventListener('click', close);
    document.getElementById('mqPairOffer').addEventListener('click', createOffer);
    document.getElementById('mqPairAnswer').addEventListener('click', answerOffer);
    document.getElementById('mqPairAccept').addEventListener('click', acceptAnswer);
    const m = document.getElementById('mqPairModal');
    if (m) m.addEventListener('click', e => { if (e.target === m) close(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
