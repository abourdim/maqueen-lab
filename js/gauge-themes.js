// ============================================================
// gauge-themes.js — Dashboard gauge visual themes v3.
//
// Each non-dark theme REPLACES the SVG needle gauge with a
// completely different widget:
//
//   🏎️  Race  — digital LED-segment number + 10-dot rev bar
//   📻  Retro — warm analog (SVG kept) + backlight overlay
//   🌃  Cyber — CSS conic-gradient arc + split-glow center
//   🎈  Fun   — emoji icon + filled progress bar + big value
//   🚀  Space — monospaced ASCII terminal lines + bar chart
//
// Values are read from the existing DOM elements that maqueen-tab.js
// already updates — zero coupling to BLE logic.
// ============================================================
(function () {
  'use strict';

  const KEY = 'maqueen.gaugeTheme';

  const THEMES = [
    { id: 'dark',  icon: '🌑', label: 'Dark'  },
    { id: 'race',  icon: '🏎️', label: 'Race'  },
    { id: 'retro', icon: '📻', label: 'Retro' },
    { id: 'cyber', icon: '🌃', label: 'Cyber' },
    { id: 'fun',   icon: '🎈', label: 'Fun'   },
    { id: 'space', icon: '🚀', label: 'Space' },
  ];

  // Gauge metadata — maps to the 4 .mq-gauge cards in DOM order.
  const DEFS = [
    { valId: 'mqGaugeValSpeed', label: 'SPEED', unit: 'CM/S', max: 30,  color: '#38bdf8',
      emoji: ['🐢','🚗','🏎️','🚀'], termId: 'SPEED_SENSOR' },
    { valId: 'mqGaugeValPower', label: 'POWER', unit: '%',   max: 100, color: '#fb923c',
      emoji: ['😴','⚡','🔥','💥'], termId: 'MOTOR_POWER' },
    { valId: 'mqGaugeValHead',  label: 'HEAD',  unit: 'DEG', max: 360, color: '#4ade80',
      emoji: ['⬆️','➡️','⬇️','⬅️'], termId: 'COMPASS_HDG' },
    { valId: 'mqGaugeValSonar', label: 'SONAR', unit: 'CM',  max: 150, color: '#fbbf24',
      emoji: ['🟥','🟧','🟨','🟩'], termId: 'SONAR_RANGE' },
  ];

  let activeTheme = 'dark';
  let pollTimer   = null;

  // ── Value helpers ────────────────────────────────────────────
  function readVal(def) {
    const el = document.getElementById(def.valId);
    if (!el) return 0;
    const v = parseFloat(el.textContent);
    return isNaN(v) ? 0 : v;
  }
  function readRaw(def) {
    const el = document.getElementById(def.valId);
    return el ? el.textContent.trim() : '—';
  }
  function pct(def) {
    return Math.max(0, Math.min(1, readVal(def) / def.max));
  }

  // ── Widget builders ──────────────────────────────────────────

  // 🏎️ Race: LED dot bar (10 dots) + giant digital number
  function buildRace(def) {
    const w = document.createElement('div');
    w.className = 'mq-alt mq-alt-race';
    w.innerHTML = `
      <div class="mq-alt-race-label">${def.label}</div>
      <div class="mq-alt-race-bar">${Array.from({length:10},(_,i)=>`<span data-i="${i}"></span>`).join('')}</div>
      <div class="mq-alt-race-val">—</div>
      <div class="mq-alt-race-unit">${def.unit}</div>`;
    return w;
  }
  function updateRace(w, def) {
    const p   = pct(def);
    const raw = readRaw(def);
    w.querySelector('.mq-alt-race-val').textContent = raw;
    w.querySelectorAll('.mq-alt-race-bar span').forEach((s, i) => {
      const on = i < Math.round(p * 10);
      s.style.background = on
        ? (i >= 8 ? '#ef4444' : i >= 6 ? '#f97316' : def.color)
        : 'rgba(255,255,255,0.08)';
      s.style.boxShadow  = on ? `0 0 6px ${def.color}` : 'none';
    });
  }

  // 📻 Retro: keep SVG, add backlight overlay
  function buildRetro(def) {
    const w = document.createElement('div');
    w.className = 'mq-alt mq-alt-retro';
    w.innerHTML = `<div class="mq-alt-retro-glow"></div>`;
    return w;
  }
  function updateRetro(w, def) {
    const p = pct(def);
    const g = w.querySelector('.mq-alt-retro-glow');
    g.style.opacity = 0.15 + p * 0.45;
    g.style.background = `radial-gradient(circle at 50% 60%, ${def.color}66, transparent 70%)`;
  }

  // 🌃 Cyber: conic-gradient arc + glowing center value
  function buildCyber(def) {
    const w = document.createElement('div');
    w.className = 'mq-alt mq-alt-cyber';
    w.innerHTML = `
      <div class="mq-alt-cyber-arc"></div>
      <div class="mq-alt-cyber-center">
        <div class="mq-alt-cyber-val">—</div>
        <div class="mq-alt-cyber-unit">${def.unit}</div>
      </div>
      <div class="mq-alt-cyber-label">${def.label}</div>`;
    return w;
  }
  function updateCyber(w, def) {
    const p   = pct(def);
    const deg = Math.round(p * 270);   // 270° sweep like the original gauge
    const arc = w.querySelector('.mq-alt-cyber-arc');
    // Conic starts at top-left (−135° offset) → use transform rotate
    arc.style.background =
      `conic-gradient(${def.color} ${deg}deg, rgba(255,255,255,0.06) ${deg}deg)`;
    arc.style.boxShadow = `0 0 20px ${def.color}55, inset 0 0 20px rgba(0,0,0,0.8)`;
    w.querySelector('.mq-alt-cyber-val').textContent = readRaw(def);
    w.querySelector('.mq-alt-cyber-val').style.textShadow =
      `0 0 10px ${def.color}, 0 0 24px ${def.color}88, 3px 0 #ec4899, -3px 0 #ec4899`;
  }

  // 🎈 Fun: large emoji + rainbow bar + bouncy number
  function buildFun(def) {
    const w = document.createElement('div');
    w.className = 'mq-alt mq-alt-fun';
    w.style.setProperty('--fun-color', def.color);
    w.innerHTML = `
      <div class="mq-alt-fun-emoji">${def.emoji[0]}</div>
      <div class="mq-alt-fun-val">—</div>
      <div class="mq-alt-fun-bar"><div class="mq-alt-fun-fill"></div></div>
      <div class="mq-alt-fun-unit">${def.unit}</div>`;
    return w;
  }
  function updateFun(w, def) {
    const p   = pct(def);
    const idx = Math.min(def.emoji.length - 1, Math.floor(p * def.emoji.length));
    w.querySelector('.mq-alt-fun-emoji').textContent = def.emoji[idx];
    w.querySelector('.mq-alt-fun-val').textContent   = readRaw(def);
    const fill = w.querySelector('.mq-alt-fun-fill');
    fill.style.width      = (p * 100).toFixed(1) + '%';
    fill.style.background = `linear-gradient(90deg, ${def.color}, ${def.color}cc)`;
    fill.style.boxShadow  = `0 0 10px ${def.color}99`;
  }

  // 🚀 Space: ASCII terminal lines + block bar
  function buildSpace(def) {
    const w = document.createElement('div');
    w.className = 'mq-alt mq-alt-space';
    w.innerHTML = `
      <div class="mq-alt-space-prompt">&gt; ${def.termId}</div>
      <div class="mq-alt-space-val">000.0</div>
      <div class="mq-alt-space-bar"></div>
      <div class="mq-alt-space-status">STATUS: <span>NOMINAL</span></div>`;
    return w;
  }
  function updateSpace(w, def) {
    const p   = pct(def);
    const raw = readRaw(def);
    // Zero-pad to fixed width
    const padded = raw === '—' ? '---.-' : raw.padStart(5, '0');
    w.querySelector('.mq-alt-space-val').textContent = padded;
    // ASCII block bar: 12 chars
    const filled = Math.round(p * 12);
    w.querySelector('.mq-alt-space-bar').textContent =
      '[' + '█'.repeat(filled) + '░'.repeat(12 - filled) + ']';
    const status = w.querySelector('.mq-alt-space-status span');
    status.textContent = p > 0.85 ? 'WARNING' : p > 0 ? 'NOMINAL' : 'STANDBY';
    status.style.color = p > 0.85 ? '#ff4444' : p > 0 ? '#00ff88' : '#666';
  }

  // ── Alt gauge lifecycle ──────────────────────────────────────
  const BUILDERS = { race: buildRace, retro: buildRetro, cyber: buildCyber, fun: buildFun, space: buildSpace };
  const UPDATERS = { race: updateRace, retro: updateRetro, cyber: updateCyber, fun: updateFun, space: updateSpace };

  function injectAltGauges(theme) {
    document.querySelectorAll('.mq-dash-gauges .mq-gauge').forEach((card, i) => {
      card.querySelector('.mq-alt')?.remove();
      if (theme === 'dark') return;
      const def = DEFS[i];
      if (!def) return;
      const builder = BUILDERS[theme];
      if (!builder) return;
      card.appendChild(builder(def));
    });
  }

  function pollValues() {
    if (activeTheme === 'dark') return;
    const updater = UPDATERS[activeTheme];
    if (!updater) return;
    document.querySelectorAll('.mq-dash-gauges .mq-gauge').forEach((card, i) => {
      const w   = card.querySelector('.mq-alt');
      const def = DEFS[i];
      if (w && def) updater(w, def);
    });
  }

  // ── Theme application ────────────────────────────────────────
  function applyTheme(id) {
    const panel = document.querySelector('.mq-dash-panel');
    if (!panel) return;
    activeTheme = id;
    panel.dataset.dashTheme = id;
    try { localStorage.setItem(KEY, id); } catch {}
    document.querySelectorAll('.mq-gauge-theme-btn').forEach(b =>
      b.classList.toggle('mq-gauge-theme-active', b.dataset.theme === id));
    injectAltGauges(id);
    // Start / stop polling
    clearInterval(pollTimer);
    if (id !== 'dark') {
      pollTimer = setInterval(pollValues, 150);
      pollValues(); // immediate first paint
    }
  }

  // ── Picker ───────────────────────────────────────────────────
  function buildPicker() {
    const header = document.querySelector('.mq-dash-header');
    if (!header || document.getElementById('mqGaugeThemePicker')) return false;
    const picker = document.createElement('div');
    picker.id = 'mqGaugeThemePicker';
    picker.style.cssText = 'display:flex;align-items:center;gap:3px;margin-left:10px;';
    THEMES.forEach(t => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mq-gauge-theme-btn';
      btn.dataset.theme = t.id;
      btn.title = t.label;
      btn.textContent = t.icon;
      btn.addEventListener('click', () => applyTheme(t.id));
      picker.appendChild(btn);
    });
    const titleSpan = header.querySelector('span');
    titleSpan?.nextSibling ? header.insertBefore(picker, titleSpan.nextSibling)
                           : header.appendChild(picker);
    return true;
  }

  function init() {
    let tries = 0;
    const t = setInterval(() => {
      if (buildPicker() || ++tries > 30) {
        clearInterval(t);
        let saved;
        try { saved = localStorage.getItem(KEY); } catch {}
        applyTheme(saved && THEMES.some(x => x.id === saved) ? saved : 'dark');
      }
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
