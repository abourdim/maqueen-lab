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

    // 2a) Appearance row → very TOP of Settings drawer (theme + language
    //     pickers are the most-used controls, should be instant to reach).
    if (drawerBody && !drawerBody.dataset.appearanceLifted) {
      const appRow = document.getElementById('settingsAppearanceRow');
      if (appRow) {
        drawerBody.insertBefore(appRow, drawerBody.firstChild);
        drawerBody.dataset.appearanceLifted = '1';
        moved++;
      }
    }

    // 2b) Robot anatomy SVG → header (absolutely centred, animated).
    //     The kit-picker + title stay in the Settings drawer under 🤖 Robot.
    const anatomySvg = document.getElementById('mqAnatomy');
    const header = document.querySelector('.header');
    if (anatomySvg && header && !header.dataset.robotLifted) {
      header.dataset.robotLifted = '1';
      header.style.position = 'relative'; // anchor for the abs-centred SVG
      let wrap = document.getElementById('mqHeaderRobot');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'mqHeaderRobot';
        wrap.className = 'mq-header-robot';
        header.appendChild(wrap);
      }
      // Clear any inline width so CSS governs size.
      anatomySvg.style.width  = '';
      anatomySvg.style.height = '';
      anatomySvg.style.maxWidth = '';
      wrap.appendChild(anatomySvg);
      moved++;
    }

    // 2c) Robot identity (title + kit picker) → Settings drawer (below Appearance).
    //     #mqAnatomy has already been extracted; only the title-block and
    //     kit picker remain in .rail-robot now.
    if (drawerBody && robotCard && !robotCard.dataset.relocated) {
      const sec = ensureSection(drawerBody, 'mqDrawerRobot', '🤖 Robot');
      robotCard.dataset.relocated = '1';
      sec.appendChild(robotCard);
      // Insert after the appearance row (second position).
      const appRow = document.getElementById('settingsAppearanceRow');
      const anchor = appRow ? appRow.nextSibling : drawerBody.firstChild;
      drawerBody.insertBefore(sec, anchor);
      moved++;
    }

    // 3) CONNECT card → compact always-visible bar just below .header.
    //    The card's chrome is stripped by CSS; only version, fw, the
    //    Firmware/Streams buttons and BLE stack-flow dots remain visible
    //    in a single tight flex row — no expand/collapse needed.
    if (connectCard && !connectCard.dataset.relocated) {
      const hdr = document.querySelector('.header');
      if (hdr) {
        let wrap = document.getElementById('mqConnectPanel');
        if (!wrap) {
          wrap = document.createElement('div');
          wrap.id = 'mqConnectPanel';
          wrap.className = 'mq-connect-panel';
          hdr.insertAdjacentElement('afterend', wrap);
        }
        connectCard.dataset.relocated = '1';
        wrap.appendChild(connectCard);

        // Rescue #fwVersionLine from inside #appBuildInfo so we can
        // hide the build-info block (bare text nodes can't be CSS-targeted).
        const buildInfo  = connectCard.querySelector('#appBuildInfo');
        const fwLine     = connectCard.querySelector('#fwVersionLine');
        const statusBlk  = connectCard.querySelector('.connection-status-block');
        if (buildInfo && fwLine && statusBlk) {
          statusBlk.insertBefore(fwLine, buildInfo); // move fw line before build info
          buildInfo.style.display = 'none';          // now safe to collapse
        }
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
