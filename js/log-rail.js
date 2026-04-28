// ============================================================
// log-rail.js — Move the MESSAGE LOG into its own permanent
// right sidebar, structurally independent of the main app.
//
// At init we restructure the DOM:
//
//   <body>                        <body>
//     <div class="app">             <div class="app-shell">
//       ... CONNECT ...      →        <div class="app">
//       ... col-right ...                ... CONNECT (now spans col-right) ...
//         ... LOG CARD ...               ... (no log here anymore)
//       ... tabs ...                     ... tabs ...
//     </div>                          </div>
//                                     <aside id="logRailAside">
//                                       <div class="card log-card">
//                                         ... MESSAGE LOG ...
//                                       </div>
//                                     </aside>
//                                   </div>
//                                 </body>
//
// The shell is a CSS grid (1fr | --log-rail-w). Below 1100 px the
// grid collapses to a single column and the rail is hidden — log
// visibility on tiny screens is sacrificed for content space (the
// raw UART log is rarely useful on a phone anyway).
//
// State persisted in localStorage:
//   maqueen.logRailWidth  integer px, clamped 280..620
// ============================================================

(function () {
  'use strict';

  const WIDTH_KEY    = 'maqueen.logRailWidth';
  const MIN_W        = 280;
  const MAX_W        = 620;
  const DEFAULT_W    = 380;

  function getStoredWidth() {
    let w;
    try { w = +localStorage.getItem(WIDTH_KEY) || 0; } catch { w = 0; }
    if (!w) return DEFAULT_W;
    return Math.max(MIN_W, Math.min(MAX_W, w));
  }
  function applyWidth(w) {
    w = Math.max(MIN_W, Math.min(MAX_W, w));
    document.documentElement.style.setProperty('--log-rail-w', w + 'px');
    try { localStorage.setItem(WIDTH_KEY, String(w)); } catch {}
    return w;
  }

  // Move CONNECT card + maqueen-panel + log-card + anatomy SVG out
  // of their inline parents into a dedicated <aside> rail at the
  // layout level. Order in the rail (top → bottom):
  //   1. Anatomy ROBOT identity     ← what we're talking to
  //   2. CONNECT card                ← how we talk to it
  //   3. maqueen-panel sensors       ← what it's saying back
  //   4. MESSAGE LOG (fills rest)    ← raw wire
  // The robot at the top makes the rail self-introduce: 'meet your
  // robot, here's how to connect, here's the data, here's the wire'.
  // Idempotent — safe to call twice.
  function relocateCard() {
    const card    = document.querySelector('.log-card');
    const connect = document.querySelector('.connection-card');
    const panel   = document.getElementById('maqueen-panel');
    const robot   = document.getElementById('mqAnatomy');
    const app     = document.querySelector('.app');
    if (!card || !app) return null;
    let aside = document.getElementById('logRailAside');
    // Already moved? Done.
    if (aside && aside.contains(card)) return aside;

    // Wrap .app in a shell if not already
    let shell = document.getElementById('appShell');
    if (!shell) {
      shell = document.createElement('div');
      shell.id = 'appShell';
      shell.className = 'app-shell';
      // Put the shell where .app was, then move .app inside.
      app.parentNode.insertBefore(shell, app);
      shell.appendChild(app);
    }

    // Create rail aside if not present
    if (!aside) {
      aside = document.createElement('aside');
      aside.id = 'logRailAside';
      aside.className = 'log-rail';
      shell.appendChild(aside);
    }

    // 🤖 Robot anatomy goes FIRST — identity header for the rail.
    // Wrapped in a div for styling (centering, padding, divider).
    if (robot) {
      const robotWrap = document.createElement('div');
      robotWrap.className = 'rail-robot';
      // Strip the inline width:200px from the SVG — let CSS govern
      // the rail-context size so we can shrink it for the narrower
      // column without fighting inline styles.
      robot.style.width = '';
      robot.style.maxWidth = '';
      robotWrap.appendChild(robot);
      aside.appendChild(robotWrap);
    }

    // Order in the rail: CONNECT (top) → maqueen-panel (live sensor
    // strip, sibling) → LOG card (bottom). All three as separate
    // panels, each its own visual block.
    if (connect) {
      // Tag the rail body so CSS knows it has a connect-on-top layout.
      aside.classList.add('has-connect');
      aside.appendChild(connect);
    }
    if (panel) {
      // Tag for the rail-specific compact CSS that rewraps the strip
      // for the narrow column.
      panel.classList.add('in-rail');
      aside.appendChild(panel);
      // Pluck the 'streams: OFF' toggle out of the sensor panel and
      // dock it inside the CONNECT card next to the Firmware button.
      // Streams ON/OFF is a connection-level setting (it controls
      // continuous ACC/TEMP/LIGHT/COMPASS/BTN broadcasts), so it
      // belongs with the link controls, not the sensor readouts.
      const streamsBtn = panel.querySelector('#mq-streams-toggle');
      const fwFooter   = connect && connect.querySelector('.connection-footer');
      if (streamsBtn && fwFooter && !fwFooter.contains(streamsBtn)) {
        // Re-flow the footer as a horizontal pair.
        fwFooter.style.display = 'flex';
        fwFooter.style.gap = '6px';
        fwFooter.style.alignItems = 'stretch';
        const fwBtn = fwFooter.querySelector('button');
        if (fwBtn) fwBtn.style.flex = '1 1 auto';
        // Strip the streams button's full set of inline styles — they
        // were designed for the wide sensor panel and don't match the
        // .secondary look of the Firmware button next to it. Adopt the
        // same .secondary class so paint inherits identically; the
        // yellow accent is re-applied via .mq-streams-in-connect CSS.
        // NOTE: no .small here — user wanted footer buttons matched
        // in SIZE with Connect/Disconnect above.
        streamsBtn.removeAttribute('style');
        streamsBtn.classList.add('secondary', 'mq-streams-in-connect');
        // Equal-width pair, mirroring Connect/Disconnect above —
        // both share the footer row 50/50, same dimensions as the
        // primary buttons. flex:1 1 0 from a zero base ignores the
        // intrinsic content width so the longer 'streams: OFF' label
        // doesn't make that pill wider than 'Firmware'.
        streamsBtn.style.flex = '1 1 0';
        if (fwBtn) fwBtn.style.flex = '1 1 0';
        fwFooter.appendChild(streamsBtn);
      }
    }
    aside.appendChild(card);
    return aside;
  }

  // ---- DRAG-TO-RESIZE -----------------------------------------
  // Insert a transparent vertical strip on the LEFT edge of the rail.
  // Pointer drag updates --log-rail-w → CSS grid recomputes the
  // column widths → main app shrinks/grows in real time.
  function initDrag(aside) {
    if (!aside || document.getElementById('logRailHandle')) return;
    const handle = document.createElement('div');
    handle.id = 'logRailHandle';
    handle.className = 'log-rail-handle';
    handle.setAttribute('aria-hidden', 'true');
    handle.title = 'Drag to resize. Double-click to reset width.';
    aside.appendChild(handle);

    let dragging = false;
    let startX   = 0;
    let startW   = 0;
    handle.addEventListener('pointerdown', (e) => {
      dragging = true;
      startX = e.clientX;
      startW = getStoredWidth();
      handle.classList.add('dragging');
      try { handle.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      // Handle is on the LEFT edge of the rail. Moving LEFT (negative
      // dx) → wider rail. New width = startW - dx.
      const dx = e.clientX - startX;
      applyWidth(startW - dx);
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('dragging');
      try { handle.releasePointerCapture(e.pointerId); } catch {}
    }
    handle.addEventListener('pointerup',     endDrag);
    handle.addEventListener('pointercancel', endDrag);
    handle.addEventListener('dblclick', () => { applyWidth(DEFAULT_W); });
  }

  // The old per-card 'Pin' button is now meaningless (the rail is
  // permanent). Leave it in the DOM but hide it gracefully so any
  // existing references / event listeners don't break.
  function hidePinButton() {
    const btn = document.getElementById('logPinBtn');
    if (btn) btn.style.display = 'none';
  }

  function init() {
    const aside = relocateCard();
    if (!aside) return;
    applyWidth(getStoredWidth());
    initDrag(aside);
    hidePinButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
