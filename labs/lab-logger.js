/* ============================================================
   Lab Logger — 100% faithful to index.html's MESSAGE LOG.

   API mirror:
     LabLogger.mount(target, { surface: 'IR Lab' })
     LabLogger.addLogLine(text, kind)    — same signature as index.html / js/core.js
     LabLogger.tx(verb)                  — '→ VERB'
     LabLogger.clearLog()
     LabLogger.exportLog()
     LabLogger.pin(true|false)           — toggle right-rail pinned mode

   Bullet-proof RobiBle hook capture:
     We use Object.defineProperty getters/setters on window.RobiBle.onLog,
     onRxLine, onStatus so that any later assignment by the lab is
     CHAINED, not overwritten. This guarantees log lines show up even if
     a lab installs its own handler after mount.

   Pin behavior mirrors js/log-rail.js:
     Width persisted to localStorage('robi.labLog.w'), clamped 280..620.
     Pin state persisted to localStorage('robi.labLog.pinned').
     Body gets `.lab-log-pinned` class so the page can shrink.
   ============================================================ */
(function () {
  'use strict';

  const KEY_PINNED = 'robi.labLog.pinned';
  const KEY_WIDTH  = 'robi.labLog.w';
  const KEY_MIN_W  = 280;
  const KEY_MAX_W  = 620;

  let logEl = null;          // <div class="ll-body"> currently in use
  let panelEl = null;        // <div class="lab-logger"> root
  let originalParent = null; // where the panel originally sat (so we can un-pin)
  let surfaceName = 'Lab';
  let railEl = null;
  let pinBtn = null;

  function nowStamp() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '.' + String(d.getMilliseconds()).padStart(3, '0');
  }

  /* The single source of truth for adding a line. Mirrors js/core.js exactly. */
  function addLogLine(text, kind) {
    if (!logEl) return;
    kind = kind || 'info';
    const line = document.createElement('div');
    line.className = 'log-' + kind;
    line.textContent = '[' + nowStamp() + '] ' + text;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
    while (logEl.children.length > 500) logEl.removeChild(logEl.firstChild);
  }

  function clearLog() { if (logEl) logEl.innerHTML = ''; }

  function exportLog() {
    if (!logEl) return;
    const text = logEl.innerText;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const slug = (surfaceName || 'lab').toLowerCase().replace(/\s+/g, '_');
    a.href = url;
    a.download = slug + '_log_' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function copyLog() {
    if (!logEl) return;
    const text = logEl.innerText;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => addLogLine('· copied to clipboard', 'success'),
        () => addLogLine('· clipboard write blocked', 'warn')
      );
    } else {
      addLogLine('· clipboard API unavailable', 'warn');
    }
  }

  /* ---------- Render skeleton ---------- */
  function renderInto(container, opts) {
    const surface = (opts && opts.surface) || 'Lab';
    surfaceName = surface;
    container.classList.add('lab-logger');
    container.innerHTML =
      '<div class="ll-header">' +
        '<div class="ll-titleblock">' +
          '<div class="ll-icon-wrap"><span class="ll-icon">📜</span></div>' +
          '<div>' +
            '<div class="ll-title" data-i18n="ll_title">MESSAGE LOG</div>' +
            '<div class="ll-subtitle" data-i18n="ll_subtitle">Raw UART messages</div>' +
            /* Connected-device pill — populated live from RobiBle.onStatus(state, name).
               Hidden when disconnected (no name). */
            '<div class="ll-device" id="llDevice" hidden></div>' +
          '</div>' +
        '</div>' +
        '<div class="ll-controls">' +
          '<button class="ll-btn" id="llClearBtn"  type="button" title="Clear log">' +
            '<span class="ll-btn-icon">🗑</span><span data-i18n="ll_clear">Clear</span>' +
          '</button>' +
          '<button class="ll-btn" id="llCopyBtn"   type="button" title="Copy log to clipboard">' +
            '<span class="ll-btn-icon">📋</span><span data-i18n="ll_copy">Copy</span>' +
          '</button>' +
          '<button class="ll-btn" id="llExportBtn" type="button" title="Download log as .txt">' +
            '<span class="ll-btn-icon">⬇</span><span data-i18n="ll_export">Export</span>' +
          '</button>' +
          '<button class="ll-btn" id="llPinBtn"    type="button" title="Pin log to the right side — drag the left edge to resize" aria-pressed="false">' +
            '<span class="ll-btn-icon">📌</span><span data-i18n="ll_pin">Pin</span>' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="ll-body" id="llLogBody" aria-live="polite" role="log"></div>' +
      '<div class="ll-footer">' +
        '<span class="ll-badge">micro:bit ⇄ ' + surface + '</span>' +
      '</div>';
    panelEl = container;
    logEl = container.querySelector('#llLogBody');
    container.querySelector('#llClearBtn').addEventListener('click', clearLog);
    container.querySelector('#llCopyBtn').addEventListener('click', copyLog);
    container.querySelector('#llExportBtn').addEventListener('click', exportLog);
    pinBtn = container.querySelector('#llPinBtn');
    pinBtn.addEventListener('click', () => pin(!isPinned()));
  }

  /* ---------- Bullet-proof RobiBle hook capture ----------
     Replace the plain properties with getters/setters that ALWAYS chain.
     Anyone reading `RobiBle.onLog` gets back a function; anyone setting it
     stores the new handler in a private slot; we always call BOTH our
     internal logger handler AND the lab's stored handler. */
  function lockShimHook(prop, ourHandler) {
    if (!window.RobiBle) window.RobiBle = {};
    const desc = Object.getOwnPropertyDescriptor(window.RobiBle, prop);
    /* Already locked — nothing to do. */
    if (desc && desc.get && desc.get._labLoggerLock) return;
    /* Capture whatever was previously there. */
    let labHandler = (desc && 'value' in desc) ? desc.value : (desc && desc.get ? desc.get() : null);
    const chained = function () {
      try { ourHandler.apply(null, arguments); } catch (e) { /* never let logger crash the bot */ }
      if (typeof labHandler === 'function') {
        try { labHandler.apply(this, arguments); } catch (e) { /* same */ }
      }
    };
    chained._labLoggerLock = true;
    Object.defineProperty(window.RobiBle, prop, {
      configurable: true,
      enumerable: true,
      get: function () { return chained; },
      set: function (fn) { labHandler = fn; }   // store but don't override
    });
    /* Mark the getter so re-locking is a no-op. */
    Object.getOwnPropertyDescriptor(window.RobiBle, prop).get._labLoggerLock = true;
  }

  /* Auto-classify a line so its color matches the main app's TX/RX/ERR taxonomy.
     Lines from js/ble.js already arrive formatted (e.g. "TX > #162 LINE?",
     "RX < ECHO:162 LINE?", "RX < ERR:163 UNKNOWN_VERB"). We pass them through
     verbatim and pick the kind from the prefix so the right CSS class lights up. */
  function classifyLine(line, level) {
    const s = String(line || '');
    if (/^TX\s*[>>]/i.test(s))            return 'tx';
    if (/^RX\s*[<<].*\bERR\b/i.test(s))  return 'error';
    if (/^RX\s*[<<]/i.test(s))            return 'rx';
    if (/STOP/i.test(s) && level === 'error')          return 'stop';
    if (level === 'error')                              return 'error';
    if (level === 'success')                            return 'success';
    if (level === 'warn')                               return 'warn';
    return 'info';
  }

  function wireShimHooks() {
    lockShimHook('onLog', function (line, level) {
      /* Pass through verbatim — ble.js already formats TX/RX lines properly.
         Only prefix with "· " if the line is a plain status/info message
         (no TX/RX prefix, no known wire format). */
      const k = classifyLine(line, level);
      const s = String(line || '');
      const looksWireFormatted = /^(TX|RX)\s*[<>]/i.test(s);
      addLogLine(looksWireFormatted ? s : '· ' + s, k);
    });
    lockShimHook('onRxLine', function (line) {
      /* Mirror main app vocabulary: "RX < <line>" instead of an arrow. */
      const s = String(line || '');
      const k = /\bERR\b/i.test(s) ? 'error' : 'rx';
      addLogLine('RX < ' + s, k);
    });
    lockShimHook('onStatus', function (connected, name) {
      const msg = connected ? '✓ Connected' + (name ? ' · ' + name : '') : '✗ Disconnected';
      addLogLine(msg, connected ? 'success' : 'warn');
      /* Persistent device-name pill in the header. Survives log scrolling so
         the user always knows which physical robot they're paired to. */
      const pill = panelEl && panelEl.querySelector('#llDevice');
      if (pill) {
        if (connected && name) {
          pill.textContent = '🤖 ' + name;
          pill.hidden = false;
        } else {
          pill.textContent = '';
          pill.hidden = true;
        }
      }
    });
  }

  /* ---------- Pin / unpin to right rail ---------- */
  function getStoredWidth() {
    let w = 0;
    try { w = +localStorage.getItem(KEY_WIDTH) || 0; } catch {}
    if (!w) w = 380;
    return Math.max(KEY_MIN_W, Math.min(KEY_MAX_W, w));
  }
  function applyWidth(w) {
    w = Math.max(KEY_MIN_W, Math.min(KEY_MAX_W, w));
    document.documentElement.style.setProperty('--lab-log-rail-w', w + 'px');
    try { localStorage.setItem(KEY_WIDTH, String(w)); } catch {}
    return w;
  }
  function isPinned() { return !!railEl && document.body.contains(railEl); }

  function buildRail() {
    const aside = document.createElement('aside');
    aside.className = 'lab-log-rail';
    /* Drag handle on the LEFT edge */
    const handle = document.createElement('div');
    handle.className = 'lab-log-rail-handle';
    handle.setAttribute('aria-label', 'Resize log panel');
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    let dragging = false, startX = 0, startW = 0;
    handle.addEventListener('pointerdown', (e) => {
      dragging = true; startX = e.clientX; startW = aside.offsetWidth;
      handle.classList.add('dragging');
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const delta = startX - e.clientX;
      applyWidth(startW + delta);
    });
    handle.addEventListener('pointerup',   () => { dragging = false; handle.classList.remove('dragging'); });
    handle.addEventListener('pointercancel', () => { dragging = false; handle.classList.remove('dragging'); });
    aside.appendChild(handle);
    return aside;
  }

  function pin(on) {
    if (on && !isPinned()) {
      if (!panelEl) return;
      originalParent = panelEl.parentNode;
      railEl = buildRail();
      railEl.appendChild(panelEl);
      document.body.appendChild(railEl);
      document.body.classList.add('lab-log-pinned');
      applyWidth(getStoredWidth());
      if (pinBtn) { pinBtn.setAttribute('aria-pressed', 'true'); }
      try { localStorage.setItem(KEY_PINNED, '1'); } catch {}
      addLogLine('· log pinned to right rail', 'info');
    } else if (!on && isPinned()) {
      if (originalParent) originalParent.appendChild(panelEl);
      if (railEl && railEl.parentNode) railEl.parentNode.removeChild(railEl);
      railEl = null;
      document.body.classList.remove('lab-log-pinned');
      if (pinBtn) { pinBtn.setAttribute('aria-pressed', 'false'); }
      try { localStorage.setItem(KEY_PINNED, '0'); } catch {}
      addLogLine('· log unpinned', 'info');
    }
  }

  /* ---------- Public mount ---------- */
  function mount(target, opts) {
    const el = (typeof target === 'string') ? document.querySelector(target) : target;
    if (!el) { console.warn('[lab-logger] target not found:', target); return; }
    renderInto(el, opts || {});
    wireShimHooks();
    addLogLine('UI ready · ' + (opts && opts.surface || 'Lab'), 'success');
    /* Default behavior: pin to right rail on desktop (≥1100 px) so the
       log is visible during debugging without the kid having to scroll.
       Persisted choice always wins — if the kid explicitly unpinned in
       a prior visit, we honor that. */
    let stored = null;
    try { stored = localStorage.getItem(KEY_PINNED); } catch {}
    /* Right-rail is the canonical layout (mirrors main app's MESSAGE LOG).
       Always pin on desktop ≥1100px regardless of any stored "0" — kids
       who unpin during a session don't lock themselves out next visit.
       Persisted '1' is also honored on tiny viewports as a forced pin. */
    // Honor the user's last explicit choice. If they never made one, default
    // to pinned on desktop ≥1100px so the log is visible without scrolling.
    const shouldPin = (stored === '1') ? true
                    : (stored === '0') ? false
                    : (window.innerWidth >= 1100);
    if (shouldPin) pin(true);
    /* Log lifecycle markers so the panel is ALIVE on first paint, not just "UI ready". */
    addLogLine('· theme=' + (document.documentElement.getAttribute('data-theme') || '?')
             + ' · lang='  + (document.documentElement.getAttribute('lang')       || '?')
             + ' · vw='    + window.innerWidth + 'px', 'info');
    /* Auto-log any subsequent theme + lang changes via MutationObserver on <html>. */
    try {
      const obs = new MutationObserver(muts => {
        muts.forEach(m => {
          if (m.attributeName === 'data-theme') {
            addLogLine('· theme → ' + document.documentElement.getAttribute('data-theme'), 'info');
          } else if (m.attributeName === 'lang') {
            addLogLine('· lang → ' + document.documentElement.getAttribute('lang'), 'info');
          } else if (m.attributeName === 'dir') {
            addLogLine('· dir → ' + document.documentElement.getAttribute('dir'), 'info');
          }
        });
      });
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'lang', 'dir'] });
    } catch (e) { /* observer not available — degrade silently */ }
  }

  /* Public helper for labs that want to log a TX manually (matches main app
     "TX > <verb>" format). Sequence # is added by ble.js so labs that route
     all writes through bare sendLine(verb) get the # for free via onLog. */
  function tx(verb) { addLogLine('TX > ' + verb, verb === 'STOP' ? 'stop' : 'tx'); }

  window.LabLogger = {
    mount: mount,
    addLogLine: addLogLine,
    clearLog: clearLog,
    exportLog: exportLog,
    copyLog: copyLog,
    tx: tx,
    pin: pin,
    isPinned: isPinned
  };
})();
