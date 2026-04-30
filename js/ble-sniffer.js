// ============================================================
// ble-sniffer.js — Wireshark for kids.
//
// Toggle 🔬 in the log header. When ON:
//   - Every BLE-related log line (TX/RX) is re-rendered with each
//     character shown in HEX, color-coded by byte category:
//       0x20..0x7e printable ASCII = green
//       0x00..0x1f control chars   = red
//       0x80+ extended             = amber
//   - Verb prefix highlighted in cyan + classified ("MOTORS",
//     "SERVO", "BUZZER", "REPLY", "ECHO").
//   - Hover any byte = browser title shows decimal + char.
// Persisted in localStorage.maqueen.snifferOn.
// ============================================================
(function () {
  'use strict';

  const KEY = 'maqueen.snifferOn';
  let on = false;

  const VERBS = {
    'M:':    { label: 'MOTORS',    color: '#fb923c' },
    'STOP':  { label: 'STOP',      color: '#f87171' },
    'SRV:':  { label: 'SERVO',     color: '#00d4ff' },
    'LED:':  { label: 'LED',       color: '#facc15' },
    'RGB:':  { label: 'NEOPIXEL',  color: '#38bdf8' },
    'BUZZ:': { label: 'BUZZER',    color: '#fbbf24' },
    'DIST?': { label: 'DIST POLL', color: '#4ade80' },
    'DIST:': { label: 'DIST RPLY', color: '#4ade80' },
    'LINE?': { label: 'LINE POLL', color: '#4ade80' },
    'LINE:': { label: 'LINE RPLY', color: '#4ade80' },
    'IR?':   { label: 'IR POLL',   color: '#c084fc' },
    'IR:':   { label: 'IR RPLY',   color: '#c084fc' },
    'BAT?':  { label: 'BAT POLL',  color: '#22d3ee' },
    'BAT:':  { label: 'BAT RPLY',  color: '#22d3ee' },
    'HEAD?': { label: 'HEAD POLL', color: '#fbbf24' },
    'HEAD:': { label: 'HEAD RPLY', color: '#fbbf24' },
    'ECHO:': { label: 'ECHO',      color: '#94a3b8' },
    'ERR:':  { label: 'ERROR',     color: '#ef4444' },
    'INFO:': { label: 'INFO',      color: '#94a3b8' },
  };

  function classifyByte(c) {
    const code = c.charCodeAt(0);
    if (code >= 0x20 && code <= 0x7e) return 'p';   // printable
    if (code >= 0x80)                  return 'x';   // extended
    return 'c';                                       // control
  }
  function colorFor(cls) {
    return cls === 'p' ? '#4ade80' : cls === 'c' ? '#f87171' : '#fbbf24';
  }

  function classifyLine(text) {
    text = (text || '').trim();
    for (const k of Object.keys(VERBS)) {
      if (text.startsWith(k)) return { verb: k, ...VERBS[k] };
    }
    return null;
  }

  // Re-render an existing log entry into hex form. Returns new HTML.
  function renderHex(text) {
    const tag = classifyLine(text);
    let out = '<div style="font-family:JetBrains Mono, monospace; font-size:11px; line-height:1.6;">';
    if (tag) {
      out += `<span style="color:${tag.color}; font-weight:700; padding:0 6px; border-radius:3px; background:rgba(255,255,255,0.05); margin-right:8px;">[${tag.label}]</span>`;
    }
    // Each char as hex
    out += '<span style="display:inline;">';
    for (const c of text) {
      const cls = classifyByte(c);
      const hex = c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
      const tooltip = `'${c === ' ' ? '·' : c}' (${c.charCodeAt(0)})`;
      out += `<span title="${tooltip}" style="color:${colorFor(cls)}; padding:0 1px;">${hex}</span> `;
    }
    out += '</span>';
    // ASCII "decoded" line below
    out += `<div style="opacity:0.7; margin-top:2px; font-size:10px; color:#94a3b8;">→ ${escapeHtml(text)}</div>`;
    out += '</div>';
    return out;
  }
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Walk every existing log entry and re-render in place.
  function rerenderAll(targetOn) {
    const log = document.getElementById('log');
    if (!log) return;
    const entries = log.querySelectorAll('.log-entry');
    entries.forEach(entry => {
      const text = entry.dataset.snifferOriginal || entry.textContent.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '');
      // Classifiable BLE verbs only (skip plain UI messages)
      const isBle = !!classifyLine(text);
      if (!isBle) return;
      if (!entry.dataset.snifferOriginal) entry.dataset.snifferOriginal = text;
      if (targetOn) {
        entry.innerHTML = renderHex(text);
      } else {
        entry.innerHTML = escapeHtml(text);
      }
    });
  }

  // MutationObserver to re-render new entries as they arrive.
  let observer = null;
  function startObserver() {
    const log = document.getElementById('log');
    if (!log || observer) return;
    observer = new MutationObserver(muts => {
      if (!on) return;
      for (const m of muts) {
        m.addedNodes.forEach(n => {
          if (n.nodeType === 1 && n.classList && n.classList.contains('log-entry')) {
            const text = n.textContent.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '');
            if (classifyLine(text)) {
              n.dataset.snifferOriginal = text;
              n.innerHTML = renderHex(text);
            }
          }
        });
      }
    });
    observer.observe(log, { childList: true });
  }

  function paintBtn() {
    const btn = document.getElementById('mqSnifferBtn');
    if (!btn) return;
    btn.classList.toggle('mq-sniffer-on', on);
    btn.title = on ? 'BLE sniffer ON — every byte in HEX' : 'BLE sniffer OFF — plain text';
    btn.textContent = on ? '🔬 HEX' : '🔬';
  }

  function toggle() {
    on = !on;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch {}
    rerenderAll(on);
    paintBtn();
  }

  function injectBtn() {
    const controls = document.querySelector('.log-controls');
    if (!controls || document.getElementById('mqSnifferBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'mqSnifferBtn';
    btn.type = 'button';
    btn.className = 'small secondary mq-sniffer-btn';
    btn.textContent = '🔬';
    btn.style.cssText = 'padding:4px 10px;';
    btn.addEventListener('click', toggle);
    // Insert before exportLogBtn
    const exportBtn = document.getElementById('exportLogBtn');
    if (exportBtn) controls.insertBefore(btn, exportBtn);
    else controls.appendChild(btn);
  }

  function init() {
    injectBtn();
    startObserver();
    try { on = localStorage.getItem(KEY) === '1'; } catch {}
    if (on) { rerenderAll(true); }
    paintBtn();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
