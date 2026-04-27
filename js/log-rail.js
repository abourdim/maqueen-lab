// ============================================================
// log-rail.js — Pin the MESSAGE LOG to a resizable right rail.
//
// When pinned, the .log-card escapes its inline position and
// becomes a fixed-position rail glued to the right edge of the
// viewport. Body gets a matching `padding-right` so main content
// shrinks instead of being covered.
//
//   ┌───────────────────────┐ │ ┌──────────────┐
//   │  Maqueen tab + cards  │ │ │  MESSAGE LOG │  ← always visible
//   │                       │ │ │  ──○──○──○── │     (drag left
//   │                       │ │ │  [TX] #91 M..│      edge to resize)
//   │                       │ │ │  [RX] ECHO:91│
//   └───────────────────────┘ │ └──────────────┘
//                              ↑ resize handle
//
// State persisted in localStorage:
//   maqueen.logPinned    "1" | "0"
//   maqueen.logRailWidth integer px (clamped 280..620)
//
// Auto-collapses on viewports < 1100 px (forces single column on
// tablets/phones — pinning would steal too much space). The
// localStorage flag is preserved so when the user resizes back to
// desktop, the rail restores automatically.
// ============================================================

(function () {
  'use strict';

  const STORAGE_KEY  = 'maqueen.logPinned';
  const WIDTH_KEY    = 'maqueen.logRailWidth';
  const MIN_W        = 280;
  const MAX_W        = 620;
  const DEFAULT_W    = 380;
  const COLLAPSE_VIEWPORT = 1100;

  function isPinnedPref() {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  }
  function setPinnedPref(v) {
    try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0'); } catch {}
  }
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

  // Translate the button's label/icon to match current state.
  function paintButton(pinned) {
    const label = document.getElementById('logPinLabel');
    const icon  = document.getElementById('logPinIcon');
    const btn   = document.getElementById('logPinBtn');
    if (label) {
      // Use window.t if the i18n layer is loaded; otherwise sensible defaults.
      const key = pinned ? 'mq_log_unpin' : 'mq_log_pin';
      const fallback = pinned ? 'Unpin' : 'Pin';
      label.setAttribute('data-i18n', key);
      label.textContent = (window.t && typeof window.t === 'function') ? window.t(key) || fallback : fallback;
    }
    if (icon) icon.textContent = pinned ? '✕' : '📌';
    if (btn) btn.title = pinned
      ? 'Unpin log — return it to inline position'
      : 'Pin log to right side — always visible while you scroll. Drag the left edge to resize.';
  }

  function applyPinnedClass(on) {
    document.body.classList.toggle('log-pinned', !!on);
    paintButton(!!on);
  }

  // ---- DRAG-TO-RESIZE -----------------------------------------
  // Insert a transparent vertical strip on the LEFT edge of the
  // pinned card. pointerdown captures, pointermove updates width
  // (clamped), pointerup persists.
  function initDrag() {
    const card = document.querySelector('.log-card');
    if (!card) return;
    if (document.getElementById('logRailHandle')) return;
    // Make sure the handle has something to anchor against
    if (!card.style.position) card.style.position = 'relative';
    const handle = document.createElement('div');
    handle.id = 'logRailHandle';
    handle.className = 'log-rail-handle';
    handle.setAttribute('aria-hidden', 'true');
    card.appendChild(handle);

    let dragging = false;
    let startX   = 0;
    let startW   = 0;
    handle.addEventListener('pointerdown', (e) => {
      // Only meaningful when pinned; otherwise the handle is hidden via CSS.
      if (!document.body.classList.contains('log-pinned')) return;
      dragging = true;
      startX = e.clientX;
      startW = getStoredWidth();
      handle.classList.add('dragging');
      try { handle.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      // Card sits on the RIGHT; handle is on its LEFT edge. Moving the
      // handle LEFT (negative dx) makes the rail WIDER, not narrower.
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
    // Double-click on the handle resets to default width — useful escape
    // when the user has dragged the rail to an awkward size.
    handle.addEventListener('dblclick', () => { applyWidth(DEFAULT_W); });
  }

  // ---- AUTO-COLLAPSE on narrow viewports ----------------------
  // Below 1100 px we force the rail closed regardless of preference.
  // We DON'T persist the flag change — when the user resizes back
  // wide, the rail restores automatically.
  let lastWasNarrow = null;
  function evaluateViewport() {
    const narrow = window.innerWidth < COLLAPSE_VIEWPORT;
    if (narrow === lastWasNarrow) return;
    lastWasNarrow = narrow;
    if (narrow) {
      // Force-unpin visually if currently pinned, but keep the pref.
      if (document.body.classList.contains('log-pinned')) {
        applyPinnedClass(false);
      }
    } else {
      // Wide viewport — restore from preference.
      if (isPinnedPref() && !document.body.classList.contains('log-pinned')) {
        applyPinnedClass(true);
      }
    }
  }

  function init() {
    const card = document.querySelector('.log-card');
    if (!card) return;

    applyWidth(getStoredWidth());
    initDrag();

    // Wire the toggle button.
    const btn = document.getElementById('logPinBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        const willPin = !document.body.classList.contains('log-pinned');
        // Don't pin on tiny viewports — it'd cover the content.
        if (willPin && window.innerWidth < COLLAPSE_VIEWPORT) {
          // Briefly flash a visual hint then no-op
          btn.animate(
            [{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }],
            { duration: 220 }
          );
          return;
        }
        applyPinnedClass(willPin);
        setPinnedPref(willPin);
      });
    }

    // Initial state from preference (if viewport allows).
    evaluateViewport();
    if (!lastWasNarrow && isPinnedPref()) {
      applyPinnedClass(true);
    } else {
      paintButton(false);
    }

    // Listen for viewport changes (debounced).
    let resizeT = null;
    window.addEventListener('resize', () => {
      if (resizeT) clearTimeout(resizeT);
      resizeT = setTimeout(evaluateViewport, 120);
    });

    // Re-paint button label when language changes (i18n layer fires this).
    window.addEventListener('languagechange', () => {
      paintButton(document.body.classList.contains('log-pinned'));
    });
    // Also catch the app's own language switch — the lang.js module
    // sets `document.documentElement.lang` when the user picks a new
    // language; observe that as a fallback in case 'languagechange'
    // doesn't fire.
    try {
      const obs = new MutationObserver(() => {
        paintButton(document.body.classList.contains('log-pinned'));
      });
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'dir'] });
    } catch {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
