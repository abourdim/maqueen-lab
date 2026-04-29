// ============================================================
// slide-drawers.js — slide-out Settings & Help panels.
//
// Same pattern as the message-log rail: a fixed-position panel
// that lives on the right edge of the viewport. Default state is
// off-screen (transform translateX(100%)); when the user clicks
// the ⚙ or 📖 button in the header, the matching drawer slides
// in. Close via the × button, click on the dimming backdrop,
// or Esc.
//
// We REUSE the existing inline content from #mqSettingsSection
// and #mqHelpSection (which were stashed by the latest HTML edit
// in a hidden #mqSettingsHelpRow). Their <details> wrappers are
// stripped — we only need the body. Original DOM nodes are MOVED
// (not cloned) so all existing event listeners (radio change
// handlers, theme/lang move targets) keep working.
// ============================================================
(function () {
  'use strict';

  // Attach a drag handle on the left edge so the user can resize the drawer.
  function addResizeHandle(drawer) {
    const handle = document.createElement('div');
    handle.className = 'mq-drawer-resize-handle';
    handle.title = 'Drag to resize';
    drawer.appendChild(handle);

    let startX, startW;
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startW = drawer.offsetWidth;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';

      function onMove(e) {
        const delta = startX - e.clientX;   // dragging left → wider
        const newW = Math.max(280, Math.min(window.innerWidth * 0.9, startW + delta));
        drawer.style.width = newW + 'px';
      }
      function onUp() {
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function buildDrawer(id, title, accent, contentNode) {
    if (!contentNode || document.getElementById(id)) return null;
    const drawer = document.createElement('aside');
    drawer.id = id;
    drawer.className = 'mq-drawer';
    drawer.style.setProperty('--drawer-accent', accent);
    drawer.innerHTML = `
      <div class="mq-drawer-header">
        <span class="mq-drawer-title">${title}</span>
        <button class="mq-drawer-close" type="button" aria-label="Close">×</button>
      </div>
      <div class="mq-drawer-body"></div>
    `;
    drawer.querySelector('.mq-drawer-body').appendChild(contentNode);
    document.body.appendChild(drawer);
    drawer.querySelector('.mq-drawer-close').addEventListener('click', () => closeDrawer(drawer));
    addResizeHandle(drawer);
    return drawer;
  }

  function openDrawer(d) {
    if (!d) return;
    closeAll();
    d.classList.add('mq-drawer-open');
    document.getElementById('mqDrawerBackdrop')?.classList.add('mq-backdrop-open');
  }
  function closeDrawer(d) {
    if (!d) return;
    d.classList.remove('mq-drawer-open');
    if (!document.querySelector('.mq-drawer-open')) {
      document.getElementById('mqDrawerBackdrop')?.classList.remove('mq-backdrop-open');
    }
  }
  function closeAll() {
    document.querySelectorAll('.mq-drawer-open').forEach(d => d.classList.remove('mq-drawer-open'));
    document.getElementById('mqDrawerBackdrop')?.classList.remove('mq-backdrop-open');
  }

  function ensureBackdrop() {
    if (document.getElementById('mqDrawerBackdrop')) return;
    const bd = document.createElement('div');
    bd.id = 'mqDrawerBackdrop';
    bd.className = 'mq-drawer-backdrop';
    bd.addEventListener('click', closeAll);
    document.body.appendChild(bd);
  }

  function injectHeaderButtons() {
    const header = document.querySelector('.header');
    if (!header || document.getElementById('headerSettingsBtn')) return;
    const settingsBtn = document.createElement('button');
    settingsBtn.id = 'headerSettingsBtn';
    settingsBtn.type = 'button';
    settingsBtn.className = 'mq-header-icon-btn mq-header-icon-right';
    settingsBtn.title = 'Settings';
    settingsBtn.innerHTML = '<span style="font-size:18px;">⚙️</span>';
    const helpBtn = document.createElement('button');
    helpBtn.id = 'headerHelpBtn';
    helpBtn.type = 'button';
    helpBtn.className = 'mq-header-icon-btn mq-header-icon-left';
    helpBtn.title = 'Help';
    helpBtn.innerHTML = '<span style="font-size:18px; font-weight:700; font-family:Inter,system-ui,sans-serif;">?</span>';
    // Help on the LEFT — insert right after the title-block.
    const titleBlock = header.querySelector('.title-block');
    if (titleBlock && titleBlock.nextSibling) {
      header.insertBefore(helpBtn, titleBlock.nextSibling);
    } else {
      header.insertBefore(helpBtn, header.firstChild);
    }
    // Settings on the RIGHT — at the end of the header row.
    header.appendChild(settingsBtn);
    settingsBtn.addEventListener('click', () => openDrawer(document.getElementById('mqSettingsDrawer')));
    helpBtn.addEventListener('click', () => openDrawer(document.getElementById('mqHelpDrawer')));
  }

  function init() {
    ensureBackdrop();
    injectHeaderButtons();
    // Pull inline content out of <details> wrappers and into drawers.
    let tries = 0;
    const t = setInterval(() => {
      const settingsDetails = document.getElementById('mqSettingsSection');
      const helpDetails     = document.getElementById('mqHelpSection');
      if ((settingsDetails && helpDetails) || ++tries > 30) {
        clearInterval(t);
        if (settingsDetails) {
          const body = settingsDetails.querySelector('div'); // first body div
          if (body) buildDrawer('mqSettingsDrawer', '⚙ Settings', '#38bdf8', body);
          settingsDetails.remove();
        }
        if (helpDetails) {
          const body = helpDetails.querySelector('div');
          if (body) buildDrawer('mqHelpDrawer', '📖 Help', '#4ade80', body);
          helpDetails.remove();
        }
        // Also remove the now-empty stash wrapper.
        document.getElementById('mqSettingsHelpRow')?.remove();
      }
    }, 200);

    // Esc closes any open drawer.
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAll();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
