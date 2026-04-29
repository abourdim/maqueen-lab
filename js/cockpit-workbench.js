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
      '.mq-macro-bar',                    // INPUT modes + Macro Rec/Replay
      '.mq-dash-panel',                   // dashboard (controls feedback)
    ],
    map: [
      '.mq-odo-panel',                    // path + nested SLAM + Drift
    ],
    games: [
      '#mqMiniGames',
      '#mqMathGame',
    ],
    learn: [
      // The "How does this work?" details — last <details> in the
      // Drive sub-page; tag it by walking siblings of mqMathGame.
    ],
  };

  const PILL_DEFS = [
    { key: 'drive', label: '🚗 Drive',   color: '#a78bfa' },
    { key: 'map',   label: '🗺️ Map',    color: '#38bdf8' },
    { key: 'games', label: '🎮 Games',  color: '#c084fc' },
    { key: 'learn', label: '🎓 Learn',  color: '#4ade80' },
  ];

  const STORAGE_KEY = 'maqueen.workbench';

  function getActive() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (PILL_DEFS.some(p => p.key === v)) return v;
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
    // Tag the "How does this work?" <details> — walk forward from
    // mqMathGame to find the next <details> sibling.
    const math = document.getElementById('mqMathGame');
    if (math) {
      let n = math.nextElementSibling;
      while (n) {
        if (n.tagName === 'DETAILS' && !n.dataset.bench) {
          n.dataset.bench = 'learn';
          tagged++;
          break;
        }
        n = n.nextElementSibling;
      }
    }
    return tagged;
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
      b.innerHTML = `<span>${def.label}</span>`;
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
      // Stop once we have the pill-bar AND learn was tagged
      // (the math game appears slightly later than the rest).
      const haveLearn = !!document.querySelector('[data-bench="learn"]');
      if ((document.getElementById('mqWorkbenchPills') && haveLearn) || ++tries > 30) {
        clearInterval(t);
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
