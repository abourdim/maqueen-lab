// ============================================================
// rail-cleanup.js — make the right rail a PURE message log.
//
// log-rail.js packs three cards into the right rail:
//   1. Robot identity (anatomy SVG + KIT picker)
//   2. CONNECT (firmware version + Firmware/streams buttons +
//                BLE stack flow + telemetry chips)
//   3. MESSAGE LOG
//
// Only #3 belongs in a "log rail". This module relocates the
// other two AFTER log-rail finishes its DOM moves:
//
//   - #maqueen-panel (telemetry chips: LINE/DIST/IR/HDG/ACC/BAT/BLE)
//        → into the Drive cockpit, just above the workbench pill-bar
//          (always-visible, eyes-on-data across every workbench)
//   - .rail-robot (anatomy SVG + kit picker)
//        → into Settings drawer, new 🤖 Robot section
//   - .connection-card (firmware version + Firmware/Streams +
//                         BLE stack flow + app build info)
//        → into Settings drawer, new 🔧 Diagnostics section
//
// We MOVE nodes (not clone). Every existing JS hook (BLE handler,
// version probe, kit picker change listener, stack-flow renderer)
// continues to work — they keep their original DOM nodes.
// ============================================================
(function () {
  'use strict';

  function ensureSection(drawerBody, id, title) {
    let sec = drawerBody.querySelector('#' + id);
    if (sec) return sec;
    sec = document.createElement('div');
    sec.id = id;
    sec.className = 'mq-drawer-section';
    const h = document.createElement('div');
    h.className = 'mq-drawer-section-title';
    h.textContent = title;
    sec.appendChild(h);
    drawerBody.appendChild(sec);
    return sec;
  }

  function relocate() {
    const aside = document.querySelector('aside.right-rail, aside#mqRail, aside.mq-rail, aside.rail');
    // The rail aside is whatever holds .log-card, .rail-robot, etc.
    const log    = document.querySelector('.log-card');
    const rail   = log ? log.parentElement : aside;
    if (!rail) return false;

    const panel        = document.getElementById('maqueen-panel');
    const robotCard    = document.querySelector('.rail-robot');
    const connectCard  = rail.querySelector('.connection-card');
    const drawerBody   = document.querySelector('#mqSettingsDrawer .mq-drawer-body');
    const cockpitAnchor = document.getElementById('mqWorkbenchPills');

    let moved = 0;

    // 1) Telemetry chips → cockpit (above pill-bar). Tag with a
    //    class so cockpit-specific compact CSS can override the
    //    rail-narrow CSS.
    if (panel && cockpitAnchor && !panel.classList.contains('in-cockpit')) {
      panel.classList.remove('in-rail');
      panel.classList.add('in-cockpit');
      cockpitAnchor.parentNode.insertBefore(panel, cockpitAnchor);
      moved++;
    }

    // 2) Robot identity → TOP of Settings drawer.
    if (drawerBody && robotCard && !robotCard.dataset.relocated) {
      const sec = ensureSection(drawerBody, 'mqDrawerRobot', '🤖 Robot');
      robotCard.dataset.relocated = '1';
      sec.appendChild(robotCard);
      // Prepend so Robot is always first in the drawer.
      drawerBody.insertBefore(sec, drawerBody.firstChild);
      moved++;
    }

    // 3) CONNECT card → header area, just below .header bar.
    //    Gives instant access to firmware version + BLE stack without
    //    opening any drawer. Wrapped in a <details> so it stays tidy.
    if (connectCard && !connectCard.dataset.relocated) {
      const header = document.querySelector('.header');
      if (header) {
        let wrap = document.getElementById('mqConnectPanel');
        if (!wrap) {
          wrap = document.createElement('details');
          wrap.id = 'mqConnectPanel';
          wrap.className = 'mq-connect-panel';
          const sum = document.createElement('summary');
          sum.className = 'mq-connect-panel-summary';
          sum.textContent = '🔌 Connection details';
          wrap.appendChild(sum);
          header.insertAdjacentElement('afterend', wrap);
        }
        connectCard.dataset.relocated = '1';
        wrap.appendChild(connectCard);
        moved++;
      }
    }

    // Done when all three relocations have happened.
    const done =
      (!panel       || panel.classList.contains('in-cockpit')) &&
      (!robotCard   || robotCard.dataset.relocated) &&
      (!connectCard || connectCard.dataset.relocated);
    return done;
  }

  function init() {
    // log-rail.js builds the rail asynchronously; cockpit-workbench.js
    // builds the pill-bar asynchronously too. Poll until both
    // anchors exist, then run a single relocation pass.
    let tries = 0;
    const t = setInterval(() => {
      const haveRail   = !!document.querySelector('.log-card');
      const haveCockpit = !!document.getElementById('mqWorkbenchPills');
      const haveDrawer = !!document.querySelector('#mqSettingsDrawer .mq-drawer-body');
      if ((haveRail && haveCockpit && haveDrawer && relocate()) || ++tries > 50) {
        clearInterval(t);
      }
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
