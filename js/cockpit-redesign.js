// ============================================================
// cockpit-redesign.js — Wave 9 ergonomics:
//   • Floating STOP — always-visible safety anchor, anchored to
//     the viewport bottom-right. Single big red ⏹. One click =
//     immediate STOP regardless of where the user has scrolled
//     or what mode they're in.
//   • Density profiles — one of:
//        🐣 Beginner | 🎓 Standard (default) | 🥷 Hacker | 🎬 Demo
//     Each profile sets a body class that CSS uses to hide/show
//     advanced surfaces. Persists in localStorage.
// ============================================================
(function () {
  'use strict';

  const KEY_DENSITY = 'maqueen.density';

  // ---- Floating STOP -----------------------------------------
  function addFloatingStop() {
    if (document.getElementById('mqFabStop')) return;
    const btn = document.createElement('button');
    btn.id = 'mqFabStop';
    btn.type = 'button';
    btn.title = 'Emergency STOP — works from anywhere on the page';
    btn.setAttribute('aria-label', 'Emergency stop');
    btn.innerHTML = '<span class="mq-fab-icon">⏹</span><span class="mq-fab-label">STOP</span>';
    btn.addEventListener('click', () => {
      // Triple-redundant safety: send the BLE STOP, click the keypad
      // STOP button, and turn off any active autonomous mode.
      try {
        if (window.bleScheduler && window.bleScheduler.send) {
          try { window.bleScheduler.clearCoalesced('M'); } catch {}
          window.bleScheduler.send('STOP').catch(() => {});
        }
      } catch {}
      const padStop = document.querySelector('.mq-drive-btn[data-stop="1"]');
      if (padStop) padStop.click();
      // Cancel any wander / macro / autopilot in-flight
      try { window.mqWander && window.mqWander.cancel && window.mqWander.cancel(); } catch {}
      try { window.mqMacro  && window.mqMacro.cancel  && window.mqMacro.cancel(); } catch {}
      // Visual flash
      btn.classList.add('mq-fab-flash');
      setTimeout(() => btn.classList.remove('mq-fab-flash'), 250);
    });
    // Keyboard shortcut: Esc fires the STOP from anywhere
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') btn.click();
    });
    document.body.appendChild(btn);
  }

  // ---- Density profile ---------------------------------------
  // Each profile sets one body class. CSS in styles.css uses these
  // classes to hide whole surfaces. Selectable via a small chooser
  // in the page header.
  const PROFILES = [
    { id: 'beginner', label: '🐣 Beginner', desc: 'Just keypad + speed + STOP.' },
    { id: 'standard', label: '🎓 Standard', desc: 'Dashboard + personalities + path. Default.' },
    { id: 'hacker',   label: '🥷 Hacker',   desc: 'Everything + BLE sniffer + fuzz panel.' },
    { id: 'demo',     label: '🎬 Demo',     desc: 'Beginner + auto-wander pre-armed for showcases.' },
  ];

  function applyDensity(id) {
    const cls = ['mq-density-beginner','mq-density-standard','mq-density-hacker','mq-density-demo'];
    cls.forEach(c => document.body.classList.remove(c));
    document.body.classList.add('mq-density-' + id);
    try { localStorage.setItem(KEY_DENSITY, id); } catch {}
    // Demo mode: pre-arm wander for hands-off showcases (one shot)
    if (id === 'demo') {
      setTimeout(() => {
        const w = document.getElementById('mqDriveAutoWander');
        if (w && !w.classList.contains('mq-wander-active')) w.click();
      }, 1500);
    }
    paintDensityBtn(id);
  }

  function paintDensityBtn(id) {
    const btn = document.getElementById('mqDensityBtn');
    if (!btn) return;
    const p = PROFILES.find(x => x.id === id);
    btn.title = p ? p.desc : 'Density profile';
    btn.querySelector('.mq-density-label').textContent = p ? p.label : '🎓 Standard';
  }

  function buildDensityChooser() {
    if (document.getElementById('mqDensityBtn')) return;
    // Find the header — insert between the language picker and the
    // QR-share / clear-cache row.
    const iconRow = document.querySelector('.header [id="qrShareBtn"]');
    if (!iconRow) return;
    const btn = document.createElement('button');
    btn.id = 'mqDensityBtn';
    btn.type = 'button';
    btn.className = 'mq-density-btn';
    btn.style.cssText = 'border:none; background:none; cursor:pointer; padding:2px 6px; font-size:0.85rem; opacity:0.7;';
    btn.innerHTML = '<span class="mq-density-label">🎓 Standard</span>';
    btn.addEventListener('click', () => openDensityMenu(btn));
    iconRow.parentNode.insertBefore(btn, iconRow);
  }

  function openDensityMenu(anchor) {
    // Close any existing menu
    const existing = document.getElementById('mqDensityMenu');
    if (existing) { existing.remove(); return; }
    const menu = document.createElement('div');
    menu.id = 'mqDensityMenu';
    menu.className = 'mq-density-menu';
    PROFILES.forEach(p => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'mq-density-item';
      item.innerHTML = `<div class="mq-density-item-label">${p.label}</div><div class="mq-density-item-desc">${p.desc}</div>`;
      item.addEventListener('click', () => {
        applyDensity(p.id);
        menu.remove();
      });
      menu.appendChild(item);
    });
    // Position relative to the anchor button
    const r = anchor.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top  = (r.bottom + 4) + 'px';
    menu.style.left = (r.left - 100) + 'px';
    document.body.appendChild(menu);
    // Click-outside to close
    setTimeout(() => {
      function close(e) {
        if (!menu.contains(e.target) && e.target !== anchor) {
          menu.remove();
          document.removeEventListener('click', close);
        }
      }
      document.addEventListener('click', close);
    }, 0);
  }

  // ---- Floating CONNECT FAB ----------------------------------
  // Mirrors the STOP FAB but lives bottom-LEFT and is only visible
  // when the robot is not connected. Kids can't miss it.
  function addFloatingConnect() {
    if (document.getElementById('mqFabConnect')) return;
    const fab = document.createElement('button');
    fab.id   = 'mqFabConnect';
    fab.type = 'button';
    fab.title = 'Connecter le robot';
    fab.setAttribute('aria-label', 'Connect robot');
    fab.innerHTML = '<span class="mq-fab-icon">🔗</span><span class="mq-fab-label">CONNECT</span>';
    fab.addEventListener('click', () => {
      // Delegate to the existing connect button so all BLE flow is unchanged.
      const cb = document.getElementById('connectBtn');
      if (cb) cb.click();
    });
    document.body.appendChild(fab);

    // Show/hide based on BLE state using bleScheduler events.
    // Retry until bleScheduler is ready (defensive, same pattern as autopilot.js).
    function wireConnect() {
      if (!window.bleScheduler || !window.bleScheduler.on) {
        setTimeout(wireConnect, 150); return;
      }
      function sync() {
        const connected = window.bleScheduler.isConnected && window.bleScheduler.isConnected();
        fab.style.display = connected ? 'none' : '';
      }
      window.bleScheduler.on('connected',    sync);
      window.bleScheduler.on('disconnected', sync);
      sync();   // set correct state immediately on load
    }
    wireConnect();
  }

  // ---- Floating LABS FAB -------------------------------------
  // Small bottom-center button → opens the Labs hub (joystick lab,
  // ir lab, …) in a new tab. Discoverability shortcut so a kid
  // doesn't need to scroll back to the workshop banner to find labs.
  function addFloatingLabs() {
    if (document.getElementById('mqFabLabs')) return;
    const a = document.createElement('a');
    a.id = 'mqFabLabs';
    a.href = 'labs/index.html';
    a.target = '_blank';
    a.rel = 'noopener';
    a.title = 'Open Labs — interactive playgrounds';
    a.setAttribute('aria-label', 'Open Labs hub');
    a.innerHTML = '<span class="mq-fab-icon">🧪</span><span class="mq-fab-label">LABS</span>';
    // Anchors are draggable=true by default — that triggers browser's native
    // drag-to-bookmark BEFORE our pointer events fire, killing the FAB drag.
    // Disable it so makeDraggable() can take over.
    a.draggable = false;
    a.addEventListener('dragstart', e => e.preventDefault());
    a.style.userSelect = 'none';
    document.body.appendChild(a);
  }

  // ---- Make a FAB draggable ----------------------------------
  // Pointer-drag any element by its body. Persists position in localStorage
  // under the supplied key. Click-vs-drag distinction: movement under 8px
  // is treated as a click (the button's regular handler still fires).
  // Restores saved position on next visit; clamped to viewport.
  function makeDraggable(el, storageKey) {
    if (!el) return;
    const KEY = storageKey || ('mq.fab.' + el.id);
    const PAD = 6;  // keep this many px from viewport edges
    const DRAG_THRESHOLD = 8;
    let dragging = false;
    let startX = 0, startY = 0;
    let elStartX = 0, elStartY = 0;
    let moved = false;

    function clamp(x, y) {
      const r = el.getBoundingClientRect();
      const maxX = window.innerWidth  - r.width  - PAD;
      const maxY = window.innerHeight - r.height - PAD;
      return [
        Math.max(PAD, Math.min(maxX, x)),
        Math.max(PAD, Math.min(maxY, y))
      ];
    }

    function applyPos(x, y) {
      const [cx, cy] = clamp(x, y);
      // Switch from CSS-corner positioning (bottom/right/left) to absolute
      // top/left so the FAB tracks freely. We zero the corner anchors first.
      el.style.left   = cx + 'px';
      el.style.top    = cy + 'px';
      el.style.right  = 'auto';
      el.style.bottom = 'auto';
    }

    function savePos(x, y) {
      try { localStorage.setItem(KEY, JSON.stringify({ x, y })); } catch (e) {}
    }

    // Restore saved position on init
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
        // Use rAF so the FAB has a measured size before clamp() runs.
        requestAnimationFrame(() => applyPos(saved.x, saved.y));
      }
    } catch (e) {}

    el.style.touchAction = 'none';   // prevent pointercancel from native scroll
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;   // left button only
      dragging = true; moved = false;
      const r = el.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY;
      elStartX = r.left;  elStartY = r.top;
      el.setPointerCapture(e.pointerId);
      el.style.transition = 'none';   // disable hover/active transitions during drag
    });

    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!moved && (Math.abs(dx) + Math.abs(dy)) > DRAG_THRESHOLD) moved = true;
      if (moved) applyPos(elStartX + dx, elStartY + dy);
    });

    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      el.style.transition = '';
      try { el.releasePointerCapture(e.pointerId); } catch (err) {}
      if (moved) {
        const r = el.getBoundingClientRect();
        savePos(r.left, r.top);
        // Suppress the upcoming click that would otherwise fire after drag
        const suppress = (ev) => { ev.stopPropagation(); ev.preventDefault(); el.removeEventListener('click', suppress, true); };
        el.addEventListener('click', suppress, true);
      }
    }
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);

    // Re-clamp on window resize so the FAB doesn't end up offscreen.
    window.addEventListener('resize', () => {
      const r = el.getBoundingClientRect();
      if (r.left || r.top) applyPos(r.left, r.top);
    });
  }

  // ---- init --------------------------------------------------
  function init() {
    addFloatingStop();
    addFloatingConnect();
    addFloatingLabs();
    // Make all 3 FABs draggable + position-persistent.
    requestAnimationFrame(() => {
      makeDraggable(document.getElementById('mqFabStop'),    'mq.fab.stop.pos');
      makeDraggable(document.getElementById('mqFabConnect'), 'mq.fab.connect.pos');
      makeDraggable(document.getElementById('mqFabLabs'),    'mq.fab.labs.pos');
    });
    // Density chooser used to live as a standalone chip in the header.
    // It now lives inside the Settings (⚙) panel — see settings-panel.js.
    // We just apply the saved density on boot here; buildDensityChooser
    // is no-op because the chip element won't exist.
    let saved = 'standard';
    try { saved = localStorage.getItem(KEY_DENSITY) || 'standard'; } catch {}
    applyDensity(saved);
  }

  window.mqDensity = { apply: applyDensity, current: () => {
    try { return localStorage.getItem(KEY_DENSITY) || 'standard'; } catch { return 'standard'; }
  }};

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
