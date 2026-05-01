// ============================================================
// header-cleanup.js — keep header CLEAN (Connect/Disconnect only),
// move the displaced controls into the Settings section.
//
// The original index.html packed 15+ buttons into the header.
// User wants: header = logo + title + Connect/Disconnect.
// Everything else (themes, languages, share/pair, reset, nav)
// goes into the inline Settings + Help sections at the bottom.
//
// We don't DELETE the original buttons — they have JS hooks
// (controls.js theme picker, lang.js language switcher, ble.js
// connect button, qrcode share, pair-robots, etc.). We MOVE them
// into the Settings section so the hooks still work.
//
// New header Connect/Disconnect buttons are PROXIES that click
// the (now-hidden) original buttons inside the rail's CONNECT
// card — preserving all the BLE pairing logic unchanged.
// ============================================================
(function () {
  'use strict';

  function init() {
    // 1) Wire header Connect/Disconnect → click the original buttons
    //    that ble.js already wired up. The originals live inside the
    //    rail's CONNECT card; they may not be in the DOM yet on first
    //    paint (rail relocates them post-DOMContentLoaded), so retry.
    // Attach click handlers EAGERLY on the header buttons; resolve the
    // originals lazily at click time. This avoids losing the user's
    // first click when the originals aren't yet in DOM (ble.js relocates
    // them post-DOMContentLoaded). Web Bluetooth's user-gesture
    // requirement is preserved because oConn.click() is dispatched
    // synchronously inside the user's own click handler.
    const hConn = document.getElementById('headerConnectBtn');
    const hDisc = document.getElementById('headerDisconnectBtn');
    // Disconnect starts hidden — only revealed when BLE connects.
    // syncState() in wireProxies() will show it once oDisc.disabled=false.
    if (hDisc) hDisc.style.display = 'none';
    if (hConn) hConn.addEventListener('click', () => {
      const o = document.getElementById('connectBtn');
      if (o) o.click();
    });
    if (hDisc) hDisc.addEventListener('click', () => {
      const o = document.getElementById('disconnectBtn');
      if (o) o.click();
    });

    function wireProxies() {
      const oConn = document.getElementById('connectBtn');
      const oDisc = document.getElementById('disconnectBtn');
      if (!hConn || !hDisc) return false;
      // Sync disabled AND visibility: show only the relevant action.
      // Disconnected → show Connect, hide Disconnect (and vice-versa).
      function syncState() {
        if (oConn) {
          hConn.disabled = oConn.disabled;
          hConn.style.display = oConn.disabled ? 'none' : '';
        }
        if (oDisc) {
          hDisc.disabled = oDisc.disabled;
          hDisc.style.display = oDisc.disabled ? 'none' : '';
        }
      }
      if (oConn && oDisc) {
        const mo = new MutationObserver(syncState);
        mo.observe(oConn, { attributes: true, attributeFilter: ['disabled'] });
        mo.observe(oDisc, { attributes: true, attributeFilter: ['disabled'] });
        syncState();
        return true;
      }
      return false;
    }
    let tries = 0;
    const t1 = setInterval(() => {
      if (wireProxies() || ++tries > 30) clearInterval(t1);
    }, 200);

    // 2) Mirror connection-status text into the header pill so the
    //    user always knows link state without scrolling to the rail.
    function mirrorStatus() {
      const src = document.getElementById('connectionStatus');
      const dst = document.getElementById('headerStatusPill');
      if (!src || !dst) return;
      const span = dst.querySelector('span:last-child');
      const dot  = dst.querySelector('.status-dot');
      const srcSpan = src.querySelector('span:last-child');
      const srcDot  = src.querySelector('.status-dot');
      if (span && srcSpan) span.textContent = srcSpan.textContent;
      // Mirror connected class for color
      const isConnected = src.classList.contains('connected');
      dst.classList.toggle('connected', isConnected);
    }
    setInterval(mirrorStatus, 500);

    // 3) Inject Appearance + Tools rows into the Settings section.
    //    The Settings <details> already has Sweep + Density. We add
    //    two more sections: Appearance (theme + lang) and Tools
    //    (share, pair, reset, nav links). Visual icons are reused
    //    by cloning the originals (so all their JS bindings persist).
    function injectIntoSettings() {
      const settings = document.getElementById('mqSettingsSection');
      if (!settings) return false;
      if (settings.querySelector('#settingsAppearanceRow')) return true;
      const body = settings.querySelector('div'); // first inner div = body
      if (!body) return false;

      // --- Appearance row (theme + language pickers) ---
      const appearance = document.createElement('div');
      appearance.id = 'settingsAppearanceRow';
      appearance.style.cssText = 'padding-top:14px; margin-top:14px; border-top:1px solid rgba(56,189,248,0.15);';
      appearance.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
          <span style="font-size:16px;">🎨</span>
          <span style="font-weight:700; color:#38bdf8; letter-spacing:0.05em; text-transform:uppercase; font-size:12px;">Appearance</span>
        </div>
        <div style="display:flex; align-items:flex-start; gap:0; flex-wrap:nowrap; overflow:hidden;">
          <div style="flex:1; min-width:0; padding-right:14px;">
            <div style="font-size:10px; font-weight:600; color:rgba(148,163,184,0.6); letter-spacing:0.08em; text-transform:uppercase; margin-bottom:6px;">Theme</div>
            <div id="settingsThemeMount" style="display:flex; flex-wrap:wrap; gap:6px;"></div>
          </div>
          <div style="flex:0 0 auto; padding-left:14px; border-left:1px solid rgba(148,163,184,0.18);">
            <div style="font-size:10px; font-weight:600; color:rgba(148,163,184,0.6); letter-spacing:0.08em; text-transform:uppercase; margin-bottom:6px;">Language</div>
            <div id="settingsLangMount" style="display:flex; flex-wrap:wrap; gap:6px;"></div>
          </div>
        </div>
      `;
      body.appendChild(appearance);

      // --- Tools row (qr/pair/reset + nav links) ---
      const tools = document.createElement('div');
      tools.id = 'settingsToolsRow';
      tools.style.cssText = 'padding-top:14px; margin-top:14px; border-top:1px solid rgba(56,189,248,0.15);';
      tools.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
          <span style="font-size:16px;">🧰</span>
          <span style="font-weight:700; color:#38bdf8; letter-spacing:0.05em; text-transform:uppercase; font-size:12px;">Tools</span>
        </div>
        <div id="settingsToolsMount" style="display:flex; flex-wrap:wrap; gap:8px;"></div>
      `;
      body.appendChild(tools);

      // Move the originals (kept hidden in DOM for hook persistence)
      // into the appropriate mounts. We MOVE the actual nodes, not
      // clone — that way every existing JS event listener keeps
      // working unchanged. CSS `display:none` on the parent stash
      // gets cleared by giving them a class we control.
      const themePicker = document.querySelector('.theme-picker');
      const langPicker  = document.querySelector('.lang-picker');
      const themeMount = document.getElementById('settingsThemeMount');
      const langMount  = document.getElementById('settingsLangMount');
      if (themePicker && themeMount) themeMount.appendChild(themePicker);
      if (langPicker  && langMount)  langMount.appendChild(langPicker);

      const toolsMount = document.getElementById('settingsToolsMount');
      ['qrShareBtn','mqPairBtn','clearCacheBtn'].forEach(id => {
        const el = document.getElementById(id);
        if (el && toolsMount) {
          // Re-style as proper labeled chips
          el.style.opacity = '1';
          el.style.fontSize = '13px';
          el.style.padding = '8px 14px';
          el.style.background = 'rgba(56,189,248,0.08)';
          el.style.border = '1px solid rgba(56,189,248,0.25)';
          el.style.borderRadius = '8px';
          el.style.cursor = 'pointer';
          el.style.color = '#e6eef9';
          // Add a label
          const labels = { qrShareBtn:'Share QR', mqPairBtn:'Pair 2 robots', clearCacheBtn:'Reset' };
          const label = labels[id] || '';
          if (label && !el.querySelector('.lbl-added')) {
            const sp = document.createElement('span');
            sp.className = 'lbl-added';
            sp.style.cssText = 'margin-left:6px; font-size:12px;';
            sp.textContent = label;
            el.appendChild(sp);
          }
          toolsMount.appendChild(el);
        }
      });
      // Workshop links — for kids running missions. Styled prominently
      // with a cyan/amber gradient so they stand out from the engineer-only
      // tools below (lab/schematic/pinout).
      const workshopLinks = [
        { href: 'workshops/hub.html', label: '🏠 Workshops' },
        { href: 'start.html',         label: '🚀 First Day' },
        { href: 'workshops/manual.html',     label: '📚 Missions' },
        { href: 'workshops/booklet.html', label: '🎒 Journal' }
      ];
      workshopLinks.forEach(({ href, label }) => {
        // Avoid duplicates if the link is already a visible header button
        const existing = toolsMount.querySelector(`a[href="${href}"]`);
        if (existing) return;
        const stashed = document.querySelector(`#headerHiddenStash a[href="${href}"]`);
        const a = stashed || document.createElement('a');
        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = label;
        a.style.cssText = 'opacity:1; font-size:13px; padding:8px 14px; background:linear-gradient(135deg, rgba(34,197,94,0.18), rgba(56,189,248,0.18)); border:1px solid rgba(56,189,248,0.45); border-radius:8px; color:#e6eef9; text-decoration:none; font-weight:700; box-shadow:0 0 8px rgba(56,189,248,0.15);';
        toolsMount.appendChild(a);
      });
      // Engineer-only nav links (kept second so workshops show first)
      const navIds = ['lab.html','docs/schematics-kids.html','docs/schematics.html','docs/pinout.html'];
      navIds.forEach(href => {
        const a = document.querySelector(`a[href="${href}"]`);
        if (a && toolsMount) {
          a.style.opacity = '1';
          a.style.fontSize = '13px';
          a.style.padding = '8px 14px';
          a.style.background = 'rgba(74,222,128,0.08)';
          a.style.border = '1px solid rgba(74,222,128,0.25)';
          a.style.borderRadius = '8px';
          a.style.color = '#4ade80';
          toolsMount.appendChild(a);
        }
      });
      const userGuide = document.getElementById('userGuideLink');
      if (userGuide && toolsMount) {
        userGuide.style.opacity = '1';
        userGuide.style.fontSize = '13px';
        userGuide.style.padding = '8px 14px';
        userGuide.style.background = 'rgba(74,222,128,0.08)';
        userGuide.style.border = '1px solid rgba(74,222,128,0.25)';
        userGuide.style.borderRadius = '8px';
        userGuide.style.color = '#4ade80';
        toolsMount.appendChild(userGuide);
      }
      return true;
    }
    let tries2 = 0;
    const t2 = setInterval(() => {
      if (injectIntoSettings() || ++tries2 > 30) clearInterval(t2);
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
