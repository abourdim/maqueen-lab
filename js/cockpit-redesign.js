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

  // ---- init --------------------------------------------------
  function init() {
    addFloatingStop();
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
