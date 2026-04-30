// ============================================================
// cockpit-workbench.js — Drive tab: pin keypad on top, swap
// the rest via a 4-pill workbench selector (Drive / Map /
// Games / Learn).
//
// PROBLEM: Drive sub-tab had 12 stacked panels. Kids had to
// scroll past mini-games to see the path map, scroll past
// the path map to find the dashboard. Eyes-on-data failed.
//
// SOLUTION: Cockpit + Workbench. Top zone (keypad + robot +
// sonar dial) is always there. Below it, a single pill-bar
// gates which workbench is active. One panel-group at a time.
//
// IMPLEMENTATION: tag the existing panels with data-bench
// attributes at runtime; CSS hides inactive benches. No DOM
// moves — every existing JS hook keeps its anchor intact.
// ============================================================
(function () {
  'use strict';

  // Map: workbench key -> CSS selector list (each match becomes
  // a member of that workbench).
  const BENCH = {
    // Personality bar and Speed/Wander row are PROMOTED to cockpit
    // (always visible) — they're behavior settings that apply to every
    // activity, not Drive-specific. They sit above the pill-bar.
    drive: [
      '.mq-dash-panel',                   // dashboard (controls feedback)
    ],
    map: [
      '.mq-odo-panel',                    // path + nested SLAM + Drift
      '.mq-macro-bar',                    // Record/Replay — path recording belongs here
    ],
    games: [
      '#mqMiniGames',
      '#mqMathGame',
    ],
    // 'learn' bench dropped — the "How does this work?" <details>
    // panel is now always-visible at the bottom of the tab. It's a
    // passive physics reference that doesn't compete with any other
    // panel; kids should be able to peek at it from any workbench.
  };

  const PILL_DEFS = [
    { key: 'drive', icon: '🚗', label: 'Drive!',  color: '#f97316' },  // blazing orange
    { key: 'map',   icon: '🗺️', label: 'Map',     color: '#38bdf8' },  // sky blue
    { key: 'games', icon: '🎮', label: 'Play!',   color: '#22c55e' },  // neon green
  ];

  const STORAGE_KEY = 'maqueen.workbench';

  function getActive() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (PILL_DEFS.some(p => p.key === v)) return v;
      // Old 'learn' value from before learn-bench was retired —
      // silently fall back to drive.
    } catch {}
    return 'drive';
  }
  function setActive(key) {
    try { localStorage.setItem(STORAGE_KEY, key); } catch {}
  }

  function tagPanels() {
    let tagged = 0;
    Object.keys(BENCH).forEach(key => {
      BENCH[key].forEach(sel => {
        const el = document.querySelector(sel);
        if (el && !el.dataset.bench) {
          el.dataset.bench = key;
          tagged++;
        }
      });
    });
    return tagged;
  }

  // Promote Dashboard to first position in the Drive workbench:
  // move .mq-dash-panel immediately before .mq-macro-bar in the DOM so
  // when the Drive bench is active the gauges appear at the top.
  function promoteDashboard() {
    const dash  = document.querySelector('.mq-dash-panel');
    const macro = document.querySelector('.mq-macro-bar');
    if (dash && macro && macro.parentNode && dash !== macro.previousElementSibling) {
      macro.parentNode.insertBefore(dash, macro);
    }
  }

  function buildPillbar() {
    if (document.getElementById('mqWorkbenchPills')) return;
    // Anchor: insert pill-bar JUST BEFORE the first workbench panel
    // (the INPUT modes + Macro row, class .mq-macro-bar). Everything
    // above it (keypad, Personality, Speed/Wander) is the cockpit.
    const anchor = document.querySelector('.mq-macro-bar');
    if (!anchor) return;
    const bar = document.createElement('div');
    bar.id = 'mqWorkbenchPills';
    bar.className = 'mq-workbench-pills';
    PILL_DEFS.forEach(def => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mq-wb-pill';
      b.dataset.bench = def.key;
      b.style.setProperty('--pill-color', def.color);
      b.innerHTML = `<span class="mq-wb-icon">${def.icon}</span><span>${def.label}</span>`;
      b.addEventListener('click', () => activate(def.key));
      bar.appendChild(b);
    });
    anchor.parentNode.insertBefore(bar, anchor);
  }

  function activate(key) {
    setActive(key);
    document.querySelectorAll('[data-bench]').forEach(el => {
      // Skip the pill buttons themselves (they have data-bench too).
      if (el.classList.contains('mq-wb-pill')) {
        el.classList.toggle('mq-wb-pill-active', el.dataset.bench === key);
        return;
      }
      const show = el.dataset.bench === key;
      el.classList.toggle('mq-wb-hidden', !show);
    });
  }

  function init() {
    let tries = 0;
    const t = setInterval(() => {
      const tagged = tagPanels();
      const pills  = document.getElementById('mqWorkbenchPills');
      if (tagged > 0 && !pills) buildPillbar();
      if (document.getElementById('mqWorkbenchPills') || ++tries > 30) {
        clearInterval(t);
        promoteDashboard();   // Dashboard first, INPUT bar second
        activate(getActive());
      }
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
