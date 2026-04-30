// ============================================================
// settings-panel.js — ⚙ header button → modal with advanced toggles.
//
// Currently houses:
//   • Sweep Engine — Auto / Browser / Firmware
//     (with educational explainer of what each mode does)
//
// Future home for any other 'preference, not action' UI.
// ============================================================
(function () {
  'use strict';

  function buildModal() {
    if (document.getElementById('mqSettingsModal')) return;
    const modal = document.createElement('div');
    modal.id = 'mqSettingsModal';
    modal.style.cssText = `
      display:none; position:fixed; inset:0; z-index:9998;
      background:rgba(6,17,33,0.78); backdrop-filter:blur(4px);
      align-items:center; justify-content:center; padding:20px;
    `;
    modal.innerHTML = `
      <div style="background:var(--card-bg, #0f1f3d); border:1px solid var(--card-border, rgba(148,163,184,0.25)); border-radius:16px; max-width:520px; width:100%; padding:24px; box-shadow:0 20px 60px rgba(0,0,0,0.6); max-height:90vh; overflow-y:auto;">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:18px;">
          <span style="font-size:1.4rem;">⚙</span>
          <h2 style="margin:0; font-size:1.1rem; font-family:'JetBrains Mono', monospace; color:var(--text-primary, #e6eef9);">Settings</h2>
          <button id="mqSettingsClose" type="button" aria-label="Close"
                  style="margin-left:auto; background:none; border:none; color:var(--text-secondary, #93a8c4); font-size:1.5rem; line-height:1; cursor:pointer; padding:0 4px;">×</button>
        </div>

        <!-- Sweep Engine -->
        <div style="margin-bottom:18px;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
            <span style="font-size:18px;">🦾</span>
            <span style="font-weight:800; color:#38bdf8; letter-spacing:0.05em; text-transform:uppercase; font-size:13px;">Sweep Engine</span>
            <span id="mqSettingsSweepCap" style="margin-left:auto; font-family:JetBrains Mono, monospace; font-size:10px; color:var(--text-secondary, #93a8c4);">— firmware caps unknown —</span>
          </div>
          <div id="mqSettingsSweepRadio" style="display:flex; flex-direction:column; gap:6px; font-family:'JetBrains Mono', monospace; font-size:13px;">
            <label style="display:flex; align-items:flex-start; gap:8px; cursor:pointer; padding:10px; border-radius:8px; transition:background 0.12s;">
              <input type="radio" name="sweepMode" value="auto" style="margin-top:3px; accent-color:#38bdf8;">
              <span>
                <b style="color:#38bdf8;">⚡ Auto</b> <span style="color:#94a3b8;">(default)</span>
                <div style="font-weight:400; color:#94a3b8; font-size:11px; margin-top:2px;">Use firmware-side sweep when supported, fall back to browser-side.</div>
              </span>
            </label>
            <label style="display:flex; align-items:flex-start; gap:8px; cursor:pointer; padding:10px; border-radius:8px; transition:background 0.12s;">
              <input type="radio" name="sweepMode" value="browser" style="margin-top:3px; accent-color:#38bdf8;">
              <span>
                <b style="color:#fbbf24;">💻 Browser</b>
                <div style="font-weight:400; color:#94a3b8; font-size:11px; margin-top:2px;">Browser computes the angle and sends an SRV: every ~85 ms. Works on any firmware. Subject to BLE latency — can show micro-jitter on long sweeps.</div>
              </span>
            </label>
            <label style="display:flex; align-items:flex-start; gap:8px; cursor:pointer; padding:10px; border-radius:8px; transition:background 0.12s;">
              <input type="radio" name="sweepMode" value="firmware" style="margin-top:3px; accent-color:#38bdf8;">
              <span>
                <b style="color:#4ade80;">🤖 Firmware</b>
                <div style="font-weight:400; color:#94a3b8; font-size:11px; margin-top:2px;">Browser sends one SWEEP: command, the micro:bit drives the servo locally at 50 Hz and pushes SWP: position updates back at 20 Hz. Silky smooth — but needs firmware ≥ v0.2.1 (bare-metal).</div>
              </span>
            </label>
          </div>
          <div style="margin-top:10px; padding:10px; background:rgba(56,189,248,0.06); border-left:3px solid #38bdf8; border-radius:0 8px 8px 0; font-size:11.5px; color:var(--text-secondary, #cbd5e1); line-height:1.6;">
            🤓 <b>What's the difference?</b> Browser-mode sends a stream of small "go to 87°… now 88°… now 89°" commands over Bluetooth — the radio's tiny lag can make the servo overcorrect. Firmware-mode lets the robot's own brain compute the motion in real time, so the horn glides instead of stepping. <i>Edge computing, kid-sized.</i>
          </div>
        </div>

        <!-- Density Profile — was a standalone header chip; promoted
             here as a 'set-once preference' that pairs naturally with
             sweep mode. -->
        <div style="margin-top:18px; padding-top:18px; border-top:1px solid rgba(56,189,248,0.15);">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
            <span style="font-size:18px;">🎚</span>
            <span style="font-weight:800; color:#38bdf8; letter-spacing:0.05em; text-transform:uppercase; font-size:13px;">Density Profile</span>
            <span style="margin-left:auto; font-family:JetBrains Mono, monospace; font-size:10px; color:var(--text-secondary, #94a3b8);">how much to show on screen</span>
          </div>
          <div id="mqSettingsDensityRadio" style="display:flex; flex-direction:column; gap:6px; font-family:'JetBrains Mono', monospace; font-size:13px;">
            <label style="display:flex; align-items:flex-start; gap:8px; cursor:pointer; padding:10px; border-radius:8px;">
              <input type="radio" name="densityMode" value="beginner" style="margin-top:3px; accent-color:#38bdf8;">
              <span><b style="color:#fbbf24;">🐣 Beginner</b><div style="font-weight:400; color:#94a3b8; font-size:11px; margin-top:2px;">Just keypad + speed + STOP. Nothing else on screen.</div></span>
            </label>
            <label style="display:flex; align-items:flex-start; gap:8px; cursor:pointer; padding:10px; border-radius:8px;">
              <input type="radio" name="densityMode" value="standard" style="margin-top:3px; accent-color:#38bdf8;">
              <span><b style="color:#38bdf8;">🎓 Standard</b> <span style="color:#94a3b8;">(default)</span><div style="font-weight:400; color:#94a3b8; font-size:11px; margin-top:2px;">Dashboard + personalities + path. The full cockpit.</div></span>
            </label>
            <label style="display:flex; align-items:flex-start; gap:8px; cursor:pointer; padding:10px; border-radius:8px;">
              <input type="radio" name="densityMode" value="hacker" style="margin-top:3px; accent-color:#38bdf8;">
              <span><b style="color:#ef4444;">🥷 Hacker</b><div style="font-weight:400; color:#94a3b8; font-size:11px; margin-top:2px;">Standard + BLE sniffer + fuzz panel + synesthesia + fencing.</div></span>
            </label>
            <label style="display:flex; align-items:flex-start; gap:8px; cursor:pointer; padding:10px; border-radius:8px;">
              <input type="radio" name="densityMode" value="demo" style="margin-top:3px; accent-color:#38bdf8;">
              <span><b style="color:#c084fc;">🎬 Demo</b><div style="font-weight:400; color:#94a3b8; font-size:11px; margin-top:2px;">Beginner + auto-wander pre-armed for showcases. Hands-off.</div></span>
            </label>
          </div>
        </div>

        <div style="margin-top:18px; text-align:right; font-family:'JetBrains Mono', monospace; font-size:10px; color:var(--text-secondary, #94a3b8);">
          More settings coming soon.
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Wire up
    document.getElementById('mqSettingsClose').addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.style.display === 'flex') close();
    });
    // Radio buttons → write to mqSweepMode
    document.querySelectorAll('input[name="sweepMode"]').forEach(r => {
      r.addEventListener('change', (e) => {
        if (window.mqSweepMode) window.mqSweepMode.set(e.target.value);
        paintCapBadge();
      });
    });
    // Density radios → write to mqDensity
    document.querySelectorAll('input[name="densityMode"]').forEach(r => {
      r.addEventListener('change', (e) => {
        if (window.mqDensity) window.mqDensity.apply(e.target.value);
      });
    });
  }

  function paintCapBadge() {
    const el = document.getElementById('mqSettingsSweepCap');
    if (!el || !window.mqSweepMode) return;
    const caps = window.mqSweepMode.getCapabilities();
    if (!caps.length) {
      el.textContent = '— firmware caps unknown —';
      el.style.color = '#94a3b8';
    } else if (caps.indexOf('sweep') !== -1) {
      el.textContent = '✓ firmware supports SWEEP:';
      el.style.color = '#4ade80';
    } else {
      el.textContent = '✗ firmware lacks sweep — auto falls back to Browser';
      el.style.color = '#fbbf24';
    }
  }

  function open() {
    buildModal();
    // Sync radio state with current preference
    if (window.mqSweepMode) {
      const cur = window.mqSweepMode.getMode();
      document.querySelectorAll('input[name="sweepMode"]').forEach(r => {
        r.checked = (r.value === cur);
      });
    }
    paintCapBadge();
    // Sync density radios with current preference
    if (window.mqDensity) {
      const cur = window.mqDensity.current();
      document.querySelectorAll('input[name="densityMode"]').forEach(r => {
        r.checked = (r.value === cur);
      });
    }
    const m = document.getElementById('mqSettingsModal');
    if (m) m.style.display = 'flex';
  }
  function close() {
    const m = document.getElementById('mqSettingsModal');
    if (m) m.style.display = 'none';
  }

  function init() {
    const btn = document.getElementById('mqSettingsBtn');
    if (!btn) return;
    btn.addEventListener('click', open);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
