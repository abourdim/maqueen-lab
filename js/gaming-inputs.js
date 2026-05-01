// ============================================================
// gaming-inputs.js — 10 designer-grade gaming-inspired joystick modes
// ============================================================
// Inspired by: RTS click-to-move (Diablo), arcade racers (Outrun),
// physics joysticks (GameCube), fighting games (Street Fighter),
// step sequencers (DDR), casino roulette, gesture-recognition apps,
// pendulum physics, and polar coordinate radial menus.
//
// Each install* takes (host, fireVec, stop, sendVerb) and returns
// a teardown that clears the host element and stops the bot.
// ============================================================
(function () {
  'use strict';

  // Read joystick-knob palette from the active theme's CSS variables
  // so canvas-drawn round controls (Spring Stick, Pendulum, Polar Pad)
  // match the CSS-styled Classic Pad. Re-reads on every draw frame
  // so theme switches re-skin live without page reload.
  function joyPalette() {
    const cs = getComputedStyle(document.documentElement);
    const p = (n, fb) => (cs.getPropertyValue(n).trim() || fb);
    return {
      hi:   p('--joy-knob-hi',  '#fef9e7'),
      mid:  p('--joy-knob-mid', '#fb923c'),
      lo:   p('--joy-knob-lo',  '#7c2d12'),
      ring: p('--joy-ring',     '#4ade80'),
      tick: p('--joy-tick',     'rgba(168,184,204,0.18)'),
    };
  }

  // ---- Mode 21: Aim & Click (top-down RTS-style) -----------------
  function installAim(host, fireVec, stop, sendVerb) {
    host.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:10px;';
    const W = 320, H = 320;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.style.cssText = 'width:' + W + 'px; height:' + H + 'px; background:radial-gradient(circle at center, var(--bg-soft), var(--bg-card)); border:2px solid var(--cyan); border-radius:18px; cursor:crosshair;';
    // Concentric range rings
    [40, 80, 120].forEach(r => {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', W/2); c.setAttribute('cy', H/2); c.setAttribute('r', r);
      c.setAttribute('fill', 'none'); c.setAttribute('stroke', 'rgba(56,189,248,0.18)'); c.setAttribute('stroke-dasharray', '4 4');
      svg.appendChild(c);
    });
    // Crosshair lines
    [[W/2,0,W/2,H],[0,H/2,W,H/2]].forEach(p => {
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l.setAttribute('x1', p[0]); l.setAttribute('y1', p[1]); l.setAttribute('x2', p[2]); l.setAttribute('y2', p[3]);
      l.setAttribute('stroke', 'rgba(168,184,204,0.15)');
      svg.appendChild(l);
    });
    // Robot at center (small bot icon)
    const bot = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    bot.innerHTML = '<circle cx="' + W/2 + '" cy="' + H/2 + '" r="14" fill="var(--neon)" stroke="var(--ink)" stroke-width="2"/><text x="' + W/2 + '" y="' + (H/2+5) + '" text-anchor="middle" font-size="14">🤖</text>';
    svg.appendChild(bot);
    // Marker for clicked target
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    marker.style.opacity = '0';
    marker.innerHTML = '<circle cx="0" cy="0" r="10" fill="none" stroke="var(--amber)" stroke-width="2"><animate attributeName="r" values="6;14;6" dur="1s" repeatCount="indefinite"/></circle>';
    svg.appendChild(marker);
    wrap.appendChild(svg);
    const hint = document.createElement('div');
    hint.style.cssText = 'color:var(--steel); font-size:0.85rem; text-align:center; max-width:380px;';
    hint.textContent = 'RTS-style: click anywhere on the map. The robot drives toward that point until you click STOP or somewhere else.';
    wrap.appendChild(hint);
    host.appendChild(wrap);
    let driveTimer = null;
    function drive(tx, ty) {
      const dx = tx - W/2, dy = ty - H/2;
      const ang = Math.atan2(-dy, dx); // 0 = +x = right
      // Map angle to fireVec
      const xv = Math.cos(ang);
      const yv = Math.sin(ang);
      fireVec(xv, yv);
      // Stop after 1.2s (or until next click)
      clearTimeout(driveTimer);
      driveTimer = setTimeout(() => stop(), 1200);
    }
    svg.addEventListener('click', e => {
      const rect = svg.getBoundingClientRect();
      const tx = (e.clientX - rect.left) / rect.width * W;
      const ty = (e.clientY - rect.top) / rect.height * H;
      marker.setAttribute('transform', 'translate(' + tx + ',' + ty + ')');
      marker.style.opacity = '1';
      drive(tx, ty);
    });
    return () => { clearTimeout(driveTimer); host.innerHTML = ''; stop(); };
  }

  // ---- Mode 22: Steering Wheel + Pedals (arcade racer) -----------
  function installWheel(host, fireVec, stop, sendVerb) {
    host.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex; gap:24px; align-items:center; flex-wrap:wrap; justify-content:center;';
    // Wheel SVG
    const wheel = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    wheel.setAttribute('viewBox', '0 0 200 200');
    wheel.style.cssText = 'width:220px; height:220px; cursor:grab; touch-action:none; user-select:none;';
    wheel.innerHTML = `
      <circle cx="100" cy="100" r="90" fill="var(--bg-card)" stroke="var(--neon)" stroke-width="4"/>
      <circle cx="100" cy="100" r="60" fill="none" stroke="var(--cyan)" stroke-width="2" stroke-dasharray="3 5"/>
      <circle cx="100" cy="100" r="20" fill="var(--bg-soft)" stroke="var(--neon)" stroke-width="2"/>
      <g id="wheel-g">
        <line x1="100" y1="20" x2="100" y2="40" stroke="var(--neon)" stroke-width="3" stroke-linecap="round"/>
        <line x1="20" y1="100" x2="40" y2="100" stroke="var(--cyan)" stroke-width="3" stroke-linecap="round"/>
        <line x1="180" y1="100" x2="160" y2="100" stroke="var(--cyan)" stroke-width="3" stroke-linecap="round"/>
        <line x1="100" y1="180" x2="100" y2="160" stroke="var(--cyan)" stroke-width="3" stroke-linecap="round"/>
        <circle cx="100" cy="30" r="5" fill="var(--amber)"/>
      </g>
    `;
    const pedals = document.createElement('div');
    pedals.style.cssText = 'display:flex; flex-direction:column; gap:10px;';
    pedals.innerHTML = `
      <button id="gasBtn" style="padding:14px 28px; border-radius:12px; border:3px solid var(--neon); background:rgba(74,222,128,0.15); color:var(--neon); font-family:var(--font-display); font-size:1rem; font-weight:800; cursor:pointer; min-width:140px;">⛽ GAS<br><small style="font-weight:400; opacity:0.7;">hold to drive</small></button>
      <button id="brakeBtn" style="padding:14px 28px; border-radius:12px; border:3px solid var(--amber); background:rgba(251,191,36,0.15); color:var(--amber); font-family:var(--font-display); font-size:1rem; font-weight:800; cursor:pointer; min-width:140px;">🛑 BRAKE</button>
      <button id="reverseBtn" style="padding:10px 28px; border-radius:12px; border:2px solid var(--steel); background:var(--bg-card); color:var(--steel); font-size:0.85rem; cursor:pointer; min-width:140px;">↩ Reverse</button>
    `;
    wrap.appendChild(wheel);
    wrap.appendChild(pedals);
    host.appendChild(wrap);
    const hint = document.createElement('div');
    hint.style.cssText = 'color:var(--steel); font-size:0.85rem; text-align:center; margin-top:12px;';
    hint.textContent = 'Drag the wheel to steer · Hold ⛽ GAS to drive · Tap 🛑 BRAKE for instant stop.';
    host.appendChild(hint);

    let angle = 0; // -90..+90 (full lock left to right)
    let gas = 0;   // -1 (rev) .. +1 (forward)
    const wg = wheel.querySelector('#wheel-g');
    let dragging = false, startMouseAng = 0, startWheelAng = 0;
    function mouseAng(e) {
      const r = wheel.getBoundingClientRect();
      const cx = r.left + r.width/2, cy = r.top + r.height/2;
      const t = e.touches ? e.touches[0] : e;
      return Math.atan2(t.clientY - cy, t.clientX - cx) * 180 / Math.PI;
    }
    function setAngle(a) {
      angle = Math.max(-90, Math.min(90, a));
      wg.setAttribute('transform', 'rotate(' + angle + ' 100 100)');
      tick();
    }
    wheel.addEventListener('pointerdown', e => { dragging = true; startMouseAng = mouseAng(e); startWheelAng = angle; wheel.style.cursor = 'grabbing'; });
    window.addEventListener('pointermove', e => { if (dragging) setAngle(startWheelAng + (mouseAng(e) - startMouseAng)); });
    window.addEventListener('pointerup', () => { dragging = false; wheel.style.cursor = 'grab'; });
    const gasBtn = pedals.querySelector('#gasBtn'), brakeBtn = pedals.querySelector('#brakeBtn'), reverseBtn = pedals.querySelector('#reverseBtn');
    let reversed = false;
    function press() { gas = reversed ? -1 : 1; tick(); }
    function release() { gas = 0; tick(); }
    gasBtn.addEventListener('pointerdown', press);
    gasBtn.addEventListener('pointerup', release);
    gasBtn.addEventListener('pointerleave', release);
    brakeBtn.addEventListener('click', () => { gas = 0; setAngle(0); stop(); });
    reverseBtn.addEventListener('click', () => { reversed = !reversed; reverseBtn.style.borderColor = reversed ? 'var(--danger)' : 'var(--steel)'; reverseBtn.style.color = reversed ? 'var(--danger)' : 'var(--steel)'; reverseBtn.textContent = reversed ? '↩ Reversing' : '↩ Reverse'; });
    function tick() {
      if (gas === 0) { stop(); return; }
      // angle ∈ -90..+90 → x = -1..+1; y = gas (forward 1, reverse -1)
      const xv = angle / 90;
      const yv = gas;
      fireVec(xv, yv);
    }
    return () => { gasBtn.removeEventListener('pointerdown', press); host.innerHTML = ''; stop(); };
  }

  // ---- Mode 23: Spring Stick (physics-based) ---------------------
  function installSpring(host, fireVec, stop) {
    host.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:12px;';
    const SZ = 280, R = 110, KNOB = 44;
    const cnv = document.createElement('canvas');
    cnv.width = SZ; cnv.height = SZ;
    cnv.style.cssText = 'border-radius:50%; background:radial-gradient(circle, var(--bg-soft), var(--bg-card)); border:3px solid var(--neon); cursor:grab; touch-action:none;';
    wrap.appendChild(cnv);
    const hint = document.createElement('div');
    hint.style.cssText = 'color:var(--steel); font-size:0.85rem; text-align:center; max-width:340px;';
    hint.textContent = 'Real spring physics — drag the stick, release, it springs back to center with damping. Like a GameCube joystick.';
    wrap.appendChild(hint);
    host.appendChild(wrap);
    const ctx = cnv.getContext('2d');
    let px = 0, py = 0;       // displacement from center
    let vx = 0, vy = 0;
    let dragging = false;
    function pos(e) {
      const r = cnv.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return [t.clientX - r.left - SZ/2, t.clientY - r.top - SZ/2];
    }
    cnv.addEventListener('pointerdown', e => { dragging = true; cnv.style.cursor = 'grabbing'; });
    window.addEventListener('pointermove', e => {
      if (!dragging) return;
      e.preventDefault();
      const [x, y] = pos(e);
      const d = Math.hypot(x, y);
      if (d > R) { px = x / d * R; py = y / d * R; }
      else { px = x; py = y; }
    });
    window.addEventListener('pointerup', () => { dragging = false; cnv.style.cursor = 'grab'; });
    let raf;
    function tick() {
      // Physics: spring back when not dragging
      if (!dragging) {
        const k = 0.15, damping = 0.78;
        vx += -k * px;
        vy += -k * py;
        vx *= damping; vy *= damping;
        px += vx; py += vy;
        if (Math.abs(px) < 0.5 && Math.abs(py) < 0.5 && Math.hypot(vx, vy) < 0.3) { px = 0; py = 0; vx = 0; vy = 0; }
      }
      // Render
      ctx.clearRect(0, 0, SZ, SZ);
      ctx.strokeStyle = 'rgba(168,184,204,0.18)';
      ctx.lineWidth = 1;
      [0.4, 0.7, 1].forEach(f => { ctx.beginPath(); ctx.arc(SZ/2, SZ/2, R*f, 0, Math.PI*2); ctx.stroke(); });
      ctx.beginPath(); ctx.moveTo(SZ/2, 0); ctx.lineTo(SZ/2, SZ); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, SZ/2); ctx.lineTo(SZ, SZ/2); ctx.stroke();
      // Spring line from center to knob
      ctx.strokeStyle = 'var(--cyan)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(SZ/2, SZ/2); ctx.lineTo(SZ/2 + px, SZ/2 + py); ctx.stroke();
      // Knob — palette from the active theme
      const J = joyPalette();
      const grad = ctx.createRadialGradient(SZ/2 + px - 8, SZ/2 + py - 8, 4, SZ/2 + px, SZ/2 + py, KNOB/2);
      grad.addColorStop(0, J.hi);
      grad.addColorStop(0.6, J.mid);
      grad.addColorStop(1, J.lo);
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(SZ/2 + px, SZ/2 + py, KNOB/2, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = J.lo; ctx.lineWidth = 2; ctx.stroke();
      // Drive
      const xv = px / R, yv = -py / R;
      if (Math.abs(xv) < 0.06 && Math.abs(yv) < 0.06) stop();
      else fireVec(xv, yv);
      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => { cancelAnimationFrame(raf); host.innerHTML = ''; stop(); };
  }

  // ---- Mode 24: Combo Keys (fighting-game inputs) ----------------
  function installCombo(host, fireVec, stop, sendVerb) {
    host.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:14px;';
    const display = document.createElement('div');
    display.style.cssText = 'min-height:46px; padding:8px 16px; background:var(--ink); border-radius:10px; border:1px solid var(--border); font-family:var(--font-tech); font-size:1.6rem; letter-spacing:0.2em; color:var(--neon); min-width:280px; text-align:center;';
    display.textContent = '— — — — —';
    const move = document.createElement('div');
    move.style.cssText = 'color:var(--cyan); font-size:0.95rem; min-height:1.4rem;';
    move.textContent = 'press W A S D · space = pause · double-tap forward = boost';
    const cheats = document.createElement('div');
    cheats.style.cssText = 'color:var(--steel); font-size:0.78rem; max-width:380px; text-align:center; line-height:1.6;';
    cheats.innerHTML = 'Combos:<br>↑↑ = <b>boost</b> · ↓↓ = <b>recoil</b> · ←↑→ = <b>arc-right</b> · →↑← = <b>arc-left</b> · ↑↓↑↓ = <b>wiggle</b>';
    wrap.appendChild(display); wrap.appendChild(move); wrap.appendChild(cheats);
    host.appendChild(wrap);
    const buf = [];
    const aliases = { w:'↑', s:'↓', a:'←', d:'→', arrowup:'↑', arrowdown:'↓', arrowleft:'←', arrowright:'→' };
    function show() { display.textContent = (['—','—','—','—','—'].concat(buf).slice(-5)).join(' '); }
    show();
    const held = new Set();
    function push(arr) {
      buf.push(...arr);
      while (buf.length > 5) buf.shift();
      show();
      // Pattern recognition
      const tail = buf.join('');
      if (tail.endsWith('↑↑')) { move.textContent = '🚀 BOOST'; sendVerb('M:255,255'); setTimeout(stop, 400); }
      else if (tail.endsWith('↓↓')) { move.textContent = '⏪ RECOIL'; sendVerb('M:-200,-200'); setTimeout(stop, 400); }
      else if (tail.endsWith('←↑→')) { move.textContent = '↪ ARC RIGHT'; sendVerb('M:200,80'); setTimeout(stop, 600); }
      else if (tail.endsWith('→↑←')) { move.textContent = '↩ ARC LEFT'; sendVerb('M:80,200'); setTimeout(stop, 600); }
      else if (tail.endsWith('↑↓↑↓')) { move.textContent = '〰 WIGGLE'; sendVerb('M:200,-200'); setTimeout(()=>{sendVerb('M:-200,200');setTimeout(stop, 200);}, 200); }
      else { move.textContent = tail.slice(-1); }
    }
    function down(e) {
      const k = aliases[e.key.toLowerCase()] || e.key.toLowerCase();
      if (k === ' ') { stop(); e.preventDefault(); return; }
      if ('↑↓←→'.includes(k)) {
        if (held.has(k)) return; // no repeat
        held.add(k);
        push([k]);
        // Live drive while held
        let x = 0, y = 0;
        held.forEach(d => { if (d==='↑') y+=1; if (d==='↓') y-=1; if (d==='←') x-=1; if (d==='→') x+=1; });
        if (x===0 && y===0) stop(); else fireVec(x, y);
        e.preventDefault();
      }
    }
    function up(e) {
      const k = aliases[e.key.toLowerCase()] || e.key.toLowerCase();
      if ('↑↓←→'.includes(k)) {
        held.delete(k);
        let x = 0, y = 0;
        held.forEach(d => { if (d==='↑') y+=1; if (d==='↓') y-=1; if (d==='←') x-=1; if (d==='→') x+=1; });
        if (x===0 && y===0) stop(); else fireVec(x, y);
      }
    }
    document.addEventListener('keydown', down);
    document.addEventListener('keyup', up);
    return () => { document.removeEventListener('keydown', down); document.removeEventListener('keyup', up); host.innerHTML = ''; stop(); };
  }

  // ---- Mode 25: Step Sequencer (4×8 rhythm grid) -----------------
  function installSequencer(host, fireVec, stop, sendVerb) {
    host.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:10px;';
    const ROWS = [
      { name: '↑ FWD',   color: 'var(--neon)',   x: 0,  y: 1 },
      { name: '↓ BACK',  color: 'var(--orange)', x: 0,  y: -1 },
      { name: '← LEFT',  color: 'var(--cyan)',   x: -1, y: 0 },
      { name: '→ RIGHT', color: 'var(--amber)',  x: 1,  y: 0 },
    ];
    const COLS = 8;
    const grid = Array.from({length:4}, () => Array(COLS).fill(false));
    const t = document.createElement('table');
    t.style.cssText = 'border-collapse:separate; border-spacing:4px;';
    ROWS.forEach((row, ri) => {
      const tr = document.createElement('tr');
      const lab = document.createElement('td');
      lab.textContent = row.name;
      lab.style.cssText = 'color:' + row.color + '; font-family:var(--font-tech); font-size:0.78rem; padding-right:8px;';
      tr.appendChild(lab);
      for (let ci = 0; ci < COLS; ci++) {
        const td = document.createElement('td');
        const cell = document.createElement('div');
        cell.style.cssText = 'width:34px; height:34px; border-radius:8px; background:var(--bg-soft); border:1.5px solid var(--border); cursor:pointer;';
        cell.addEventListener('click', () => { grid[ri][ci] = !grid[ri][ci]; cell.style.background = grid[ri][ci] ? row.color : 'var(--bg-soft)'; });
        td.appendChild(cell);
        tr.appendChild(td);
      }
      t.appendChild(tr);
    });
    wrap.appendChild(t);
    const ctrl = document.createElement('div');
    ctrl.style.cssText = 'display:flex; gap:10px; align-items:center;';
    ctrl.innerHTML = `
      <button id="seqPlay" style="padding:8px 22px; border-radius:8px; border:2px solid var(--neon); background:rgba(74,222,128,0.15); color:var(--neon); cursor:pointer; font-weight:700;">▶ Play</button>
      <button id="seqStop" style="padding:8px 22px; border-radius:8px; border:2px solid var(--danger); background:rgba(239,68,68,0.15); color:var(--danger); cursor:pointer; font-weight:700;">⏹ Stop</button>
      <label style="color:var(--steel); font-size:0.85rem;">BPM <input id="seqBpm" type="range" min="60" max="240" value="120" style="vertical-align:middle; width:120px;"><output style="color:var(--neon);">120</output></label>
      <label style="color:var(--steel); font-size:0.85rem;"><input id="seqLoop" type="checkbox" checked> Loop</label>
    `;
    wrap.appendChild(ctrl);
    const hint = document.createElement('div');
    hint.style.cssText = 'color:var(--steel); font-size:0.82rem; text-align:center; max-width:380px;';
    hint.textContent = 'Toggle cells to build a rhythm pattern — each column is one beat. Hit ▶ Play and the robot follows the dance.';
    wrap.appendChild(hint);
    host.appendChild(wrap);
    const bpmIn = ctrl.querySelector('#seqBpm'), bpmOut = ctrl.querySelector('output'), loopIn = ctrl.querySelector('#seqLoop');
    bpmIn.addEventListener('input', () => bpmOut.textContent = bpmIn.value);
    let playTimer = null, col = 0;
    function play() {
      const ms = 60000 / parseInt(bpmIn.value, 10);
      // Highlight column
      [...t.querySelectorAll('tr')].forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds[col + 1]) tds[col + 1].firstChild && (tds[col + 1].firstChild.style.outline = '2px solid var(--cyan)');
      });
      // Mix all active rows for this column
      let xv = 0, yv = 0, n = 0;
      ROWS.forEach((row, ri) => { if (grid[ri][col]) { xv += row.x; yv += row.y; n++; } });
      if (n > 0) fireVec(xv / Math.max(1, n), yv / Math.max(1, n));
      else stop();
      const lastCol = col;
      col = (col + 1) % COLS;
      if (col === 0 && !loopIn.checked) {
        playTimer = setTimeout(() => { stop(); resetHi(); }, ms);
        return;
      }
      playTimer = setTimeout(() => { resetCol(lastCol); play(); }, ms);
    }
    function resetCol(c) {
      [...t.querySelectorAll('tr')].forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds[c + 1] && tds[c + 1].firstChild) tds[c + 1].firstChild.style.outline = '';
      });
    }
    function resetHi() { for (let i=0;i<COLS;i++) resetCol(i); col = 0; }
    ctrl.querySelector('#seqPlay').addEventListener('click', () => { resetHi(); col = 0; clearTimeout(playTimer); play(); });
    ctrl.querySelector('#seqStop').addEventListener('click', () => { clearTimeout(playTimer); resetHi(); stop(); });
    return () => { clearTimeout(playTimer); host.innerHTML = ''; stop(); };
  }

  // ---- Mode 26: Traffic Light (toddler-grade) --------------------
  function installTrafficLight(host, fireVec, stop, sendVerb) {
    host.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:14px;';
    const housing = document.createElement('div');
    housing.style.cssText = 'background:#1a1a1a; border-radius:30px; padding:18px 30px; display:flex; flex-direction:column; gap:14px; box-shadow:0 12px 36px rgba(0,0,0,0.5);';
    const lights = [
      { color: '#ef4444', label: 'STOP', verb: () => stop(), key: 'red' },
      { color: '#fbbf24', label: 'SLOW', verb: () => fireVec(0, 0.4), key: 'yellow' },
      { color: '#22c55e', label: 'GO',   verb: () => fireVec(0, 1),   key: 'green' },
    ];
    let active = null;
    lights.forEach(L => {
      const b = document.createElement('button');
      b.style.cssText = 'width:90px; height:90px; border-radius:50%; border:none; background:' + L.color + '40; cursor:pointer; transition:all 0.2s; box-shadow:inset 0 -4px 10px rgba(0,0,0,0.3); position:relative;';
      b.innerHTML = '<span style="color:#fff; font-family:var(--font-display); font-size:0.85rem; font-weight:700;">' + L.label + '</span>';
      b.addEventListener('click', () => {
        lights.forEach(x => { x._btn.style.background = x.color + '40'; x._btn.style.boxShadow = 'inset 0 -4px 10px rgba(0,0,0,0.3)'; });
        b.style.background = L.color;
        b.style.boxShadow = '0 0 32px ' + L.color + ', inset 0 -4px 10px rgba(0,0,0,0.2)';
        active = L.key;
        L.verb();
      });
      L._btn = b;
      housing.appendChild(b);
    });
    wrap.appendChild(housing);
    const hint = document.createElement('div');
    hint.style.cssText = 'color:var(--steel); font-size:0.85rem; text-align:center;';
    hint.textContent = '🚦 Tap a light: 🔴 = STOP · 🟡 = slow · 🟢 = go fast';
    wrap.appendChild(hint);
    host.appendChild(wrap);
    return () => { host.innerHTML = ''; stop(); };
  }

  // ---- Mode 27: Roulette (spinning wheel) -----------------------
  function installRoulette(host, fireVec, stop, sendVerb) {
    host.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:14px;';
    const SZ = 280, R = 130;
    const wedges = [
      { name: '↑',   x: 0, y: 1,    color: '#22c55e' },
      { name: '↗',   x: 0.7, y: 0.7, color: '#84cc16' },
      { name: '→',   x: 1, y: 0,    color: '#fbbf24' },
      { name: '↘',   x: 0.7, y: -0.7, color: '#fb923c' },
      { name: '↓',   x: 0, y: -1,   color: '#ef4444' },
      { name: '↙',   x: -0.7, y: -0.7, color: '#a855f7' },
      { name: '←',   x: -1, y: 0,   color: '#3b82f6' },
      { name: '↖',   x: -0.7, y: 0.7, color: '#06b6d4' },
    ];
    const N = wedges.length;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '-150 -150 300 300');
    svg.style.cssText = 'width:' + SZ + 'px; height:' + SZ + 'px; cursor:pointer;';
    const wheel = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    wheel.style.transition = 'transform 2.5s cubic-bezier(0.2,0.7,0.1,1)';
    wedges.forEach((w, i) => {
      const a1 = (i / N) * 2 * Math.PI - Math.PI / 2 - Math.PI / N;
      const a2 = a1 + (2 * Math.PI / N);
      const x1 = Math.cos(a1) * R, y1 = Math.sin(a1) * R;
      const x2 = Math.cos(a2) * R, y2 = Math.sin(a2) * R;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M0,0 L' + x1 + ',' + y1 + ' A' + R + ',' + R + ' 0 0 1 ' + x2 + ',' + y2 + ' Z');
      path.setAttribute('fill', w.color);
      path.setAttribute('stroke', '#0a1018');
      path.setAttribute('stroke-width', '2');
      wheel.appendChild(path);
      const am = (a1 + a2) / 2;
      const tx = Math.cos(am) * R * 0.65, ty = Math.sin(am) * R * 0.65;
      const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      txt.setAttribute('x', tx); txt.setAttribute('y', ty);
      txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('dominant-baseline', 'middle');
      txt.setAttribute('font-size', '32'); txt.setAttribute('fill', '#0a1018'); txt.setAttribute('font-weight', '700');
      txt.textContent = w.name;
      wheel.appendChild(txt);
    });
    svg.appendChild(wheel);
    // Pointer arrow at top
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    arrow.setAttribute('points', '0,-' + (R+15) + ' -10,-' + (R-5) + ' 10,-' + (R-5));
    arrow.setAttribute('fill', 'var(--neon)');
    arrow.setAttribute('stroke', '#0a1018');
    arrow.setAttribute('stroke-width', '2');
    svg.appendChild(arrow);
    // Center hub
    const hub = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    hub.setAttribute('r', '18'); hub.setAttribute('fill', 'var(--neon)'); hub.setAttribute('stroke', '#0a1018'); hub.setAttribute('stroke-width', '3');
    svg.appendChild(hub);
    wrap.appendChild(svg);
    const result = document.createElement('div');
    result.style.cssText = 'color:var(--cyan); font-family:var(--font-display); font-size:1.4rem; min-height:2rem;';
    result.textContent = 'Tap to spin';
    wrap.appendChild(result);
    const hint = document.createElement('div');
    hint.style.cssText = 'color:var(--steel); font-size:0.82rem; text-align:center;';
    hint.textContent = '🎰 Pure chaos: tap to spin, lands on a random direction, drives for 1.5s.';
    wrap.appendChild(hint);
    host.appendChild(wrap);
    let totalRot = 0, busy = false;
    svg.addEventListener('click', () => {
      if (busy) return;
      busy = true;
      const idx = Math.floor(Math.random() * N);
      const turns = 4 + Math.random() * 2;
      const finalAng = idx * 360 / N + Math.random() * (360 / N - 10) - (180 / N);
      totalRot += turns * 360 + (360 - finalAng);
      wheel.setAttribute('transform', 'rotate(' + totalRot + ')');
      result.textContent = 'Spinning…';
      setTimeout(() => {
        const w = wedges[idx];
        result.textContent = w.name + '  →  driving!';
        fireVec(w.x, w.y);
        setTimeout(() => { stop(); result.textContent = 'Tap to spin again'; busy = false; }, 1500);
      }, 2600);
    });
    return () => { host.innerHTML = ''; stop(); };
  }

  // ---- Mode 28: Gesture Shapes (draw → choreography) -------------
  function installGesture(host, fireVec, stop, sendVerb) {
    host.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:10px;';
    const cnv = document.createElement('canvas');
    cnv.width = 300; cnv.height = 300;
    cnv.style.cssText = 'border:2px solid var(--cyan); border-radius:14px; background:var(--ink); cursor:crosshair; touch-action:none;';
    wrap.appendChild(cnv);
    const result = document.createElement('div');
    result.style.cssText = 'min-height:2rem; color:var(--cyan); font-family:var(--font-display); font-size:1.2rem;';
    result.textContent = 'Draw a shape: ⭕ ▭ ⚡ ∞ ⊙';
    wrap.appendChild(result);
    const hint = document.createElement('div');
    hint.style.cssText = 'color:var(--steel); font-size:0.82rem; text-align:center; max-width:380px; line-height:1.6;';
    hint.innerHTML = 'Recognized:<br>⭕ <b>circle</b> = spin · ▭ <b>square</b> = patrol · ⚡ <b>zigzag</b> = wiggle · ∞ <b>infinity</b> = figure-8 · ↗ <b>line</b> = dash forward';
    wrap.appendChild(hint);
    host.appendChild(wrap);
    const ctx = cnv.getContext('2d');
    function clearCanvas() {
      ctx.fillStyle = 'var(--ink)'; ctx.fillRect(0, 0, 300, 300);
      ctx.strokeStyle = 'rgba(56,189,248,0.15)';
      for (let i = 0; i < 300; i += 20) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 300); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(300, i); ctx.stroke(); }
    }
    clearCanvas();
    let pts = [], drawing = false;
    function pos(e) { const r = cnv.getBoundingClientRect(); const t = e.touches?e.touches[0]:e; return [t.clientX - r.left, t.clientY - r.top]; }
    cnv.addEventListener('pointerdown', e => { e.preventDefault(); drawing = true; pts = [pos(e)]; clearCanvas(); ctx.beginPath(); ctx.moveTo(...pts[0]); ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 3; });
    cnv.addEventListener('pointermove', e => { if (!drawing) return; e.preventDefault(); const p = pos(e); pts.push(p); ctx.lineTo(...p); ctx.stroke(); });
    cnv.addEventListener('pointerup', () => { drawing = false; recognize(); });
    function recognize() {
      if (pts.length < 8) { result.textContent = '… too short'; return; }
      // Bounding box
      const xs = pts.map(p=>p[0]), ys = pts.map(p=>p[1]);
      const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
      const bw = xmax - xmin, bh = ymax - ymin;
      const start = pts[0], end = pts[pts.length-1];
      const closed = Math.hypot(start[0]-end[0], start[1]-end[1]) < Math.max(bw, bh) * 0.25;
      // Path length / bbox-perimeter ratio: circle ~ π/2; square ~ 4; zigzag much higher
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]);
      const perim = 2 * (bw + bh);
      const ratio = len / perim;
      // Direction changes (turning points) by sign-flip of dx,dy
      let turns = 0; let pdx = 0, pdy = 0;
      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i][0]-pts[i-1][0], dy = pts[i][1]-pts[i-1][1];
        if (pdx * dx < 0 || pdy * dy < 0) turns++;
        pdx = dx; pdy = dy;
      }
      // Decide
      let shape, choreo;
      if (!closed && turns < 4 && ratio < 1.4) { shape = '↗ LINE'; choreo = () => { sendVerb('M:230,230'); setTimeout(stop, 700); }; }
      else if (closed && turns < 6 && ratio < 1.5 && bw > 60 && bh > 60 && Math.abs(bw-bh)/Math.max(bw,bh) < 0.3) { shape = '⭕ CIRCLE'; choreo = () => { sendVerb('M:200,-200'); setTimeout(stop, 1200); }; }
      else if (closed && turns >= 3 && turns <= 8) { shape = '▭ SQUARE'; choreo = async () => { for (let i=0;i<4;i++) { sendVerb('M:200,200'); await new Promise(r=>setTimeout(r,400)); sendVerb('M:200,-200'); await new Promise(r=>setTimeout(r,300)); } stop(); }; }
      else if (turns >= 5) { shape = '⚡ ZIGZAG'; choreo = async () => { for (let i=0;i<3;i++) { sendVerb('M:200,80'); await new Promise(r=>setTimeout(r,300)); sendVerb('M:80,200'); await new Promise(r=>setTimeout(r,300)); } stop(); }; }
      else { shape = '∞ INFINITY'; choreo = async () => { sendVerb('M:200,80'); await new Promise(r=>setTimeout(r,800)); sendVerb('M:80,200'); await new Promise(r=>setTimeout(r,800)); stop(); }; }
      result.textContent = '✓ ' + shape;
      choreo();
    }
    return () => { host.innerHTML = ''; stop(); };
  }

  // ---- Mode 29: Pendulum (swing physics) -------------------------
  function installPendulum(host, fireVec, stop) {
    host.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:10px;';
    const SZ_W = 320, SZ_H = 320, LEN = 160;
    const cnv = document.createElement('canvas');
    cnv.width = SZ_W; cnv.height = SZ_H;
    cnv.style.cssText = 'border-radius:14px; background:radial-gradient(circle at top, var(--bg-soft), var(--bg-card)); border:2px solid var(--cyan); cursor:grab; touch-action:none;';
    wrap.appendChild(cnv);
    const hint = document.createElement('div');
    hint.style.cssText = 'color:var(--steel); font-size:0.85rem; text-align:center; max-width:340px;';
    hint.textContent = 'Drag the bob to swing it. Swing angle = steering bias · amplitude = throttle. Pure pendulum physics.';
    wrap.appendChild(hint);
    host.appendChild(wrap);
    const ctx = cnv.getContext('2d');
    let theta = 0;       // angle from vertical (radians)
    let omega = 0;       // angular velocity
    const pivX = SZ_W / 2, pivY = 30;
    let dragging = false;
    function bobPos() { return [pivX + Math.sin(theta) * LEN, pivY + Math.cos(theta) * LEN]; }
    cnv.addEventListener('pointerdown', e => { dragging = true; cnv.style.cursor = 'grabbing'; });
    window.addEventListener('pointermove', e => {
      if (!dragging) return;
      const r = cnv.getBoundingClientRect();
      const t = e.touches?e.touches[0]:e;
      const x = t.clientX - r.left - pivX, y = t.clientY - r.top - pivY;
      theta = Math.atan2(x, y);
      omega = 0;
      e.preventDefault();
    });
    window.addEventListener('pointerup', () => { dragging = false; cnv.style.cursor = 'grab'; });
    let raf, peakTheta = 0, peakOmega = 0;
    function tick() {
      if (!dragging) {
        const g = 0.005, damping = 0.992;
        omega += -g * Math.sin(theta);
        omega *= damping;
        theta += omega;
      }
      // Track peak amplitude over recent history
      peakTheta = Math.max(peakTheta * 0.98, Math.abs(theta));
      peakOmega = Math.max(peakOmega * 0.98, Math.abs(omega));
      // Draw
      ctx.fillStyle = '#0a1018'; ctx.fillRect(0, 0, SZ_W, SZ_H);
      ctx.strokeStyle = 'rgba(168,184,204,0.15)';
      ctx.beginPath(); ctx.moveTo(pivX, 0); ctx.lineTo(pivX, SZ_H); ctx.stroke();
      // Pivot
      ctx.fillStyle = '#0a1018'; ctx.beginPath(); ctx.arc(pivX, pivY, 6, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#a8b8cc'; ctx.lineWidth = 2; ctx.stroke();
      // String
      const [bx, by] = bobPos();
      ctx.strokeStyle = '#a8b8cc'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(pivX, pivY); ctx.lineTo(bx, by); ctx.stroke();
      // Bob — themed gradient
      const J = joyPalette();
      const grad = ctx.createRadialGradient(bx-8, by-8, 4, bx, by, 22);
      grad.addColorStop(0, J.hi); grad.addColorStop(0.6, J.mid); grad.addColorStop(1, J.lo);
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(bx, by, 22, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = J.lo; ctx.stroke();
      // Drive: angle → steer; peak amplitude → throttle
      const xv = Math.sin(theta);                       // -1..1
      const yv = Math.min(1, Math.abs(theta) / 0.7);    // amplitude → throttle
      if (Math.abs(theta) < 0.05) stop();
      else fireVec(xv, yv);
      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => { cancelAnimationFrame(raf); host.innerHTML = ''; stop(); };
  }

  // ---- Mode 30: Polar Pad (radial joystick) ----------------------
  function installPolar(host, fireVec, stop) {
    host.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:10px;';
    const SZ = 300, R = 130;
    const cnv = document.createElement('canvas');
    cnv.width = SZ; cnv.height = SZ;
    cnv.style.cssText = 'border-radius:50%; background:radial-gradient(circle, var(--bg-soft), var(--bg-card)); border:3px solid var(--neon); cursor:grab; touch-action:none;';
    wrap.appendChild(cnv);
    const readout = document.createElement('div');
    readout.style.cssText = 'color:var(--cyan); font-family:var(--font-tech); font-size:0.95rem; min-width:240px; text-align:center;';
    readout.textContent = 'angle 0° · speed 0';
    wrap.appendChild(readout);
    const hint = document.createElement('div');
    hint.style.cssText = 'color:var(--steel); font-size:0.82rem; text-align:center; max-width:340px;';
    hint.textContent = 'Polar joystick: drag the dot around the circle. Angle = direction · distance from center = speed.';
    wrap.appendChild(hint);
    host.appendChild(wrap);
    const ctx = cnv.getContext('2d');
    let px = 0, py = 0, dragging = false;
    function pos(e) { const r = cnv.getBoundingClientRect(); const t = e.touches?e.touches[0]:e; return [t.clientX - r.left - SZ/2, t.clientY - r.top - SZ/2]; }
    cnv.addEventListener('pointerdown', e => { dragging = true; cnv.style.cursor = 'grabbing'; const [x,y] = pos(e); px = x; py = y; });
    window.addEventListener('pointermove', e => { if (!dragging) return; e.preventDefault(); const [x,y] = pos(e); const d = Math.hypot(x,y); if (d > R) { px = x/d*R; py = y/d*R; } else { px = x; py = y; } });
    window.addEventListener('pointerup', () => { dragging = false; cnv.style.cursor = 'grab'; px = 0; py = 0; readout.textContent = 'angle 0° · speed 0'; stop(); });
    let raf;
    function tick() {
      ctx.clearRect(0, 0, SZ, SZ);
      // Speed rings
      ctx.strokeStyle = 'rgba(168,184,204,0.18)';
      [0.33, 0.66, 1].forEach(f => { ctx.beginPath(); ctx.arc(SZ/2, SZ/2, R*f, 0, Math.PI*2); ctx.stroke(); });
      // Angular ticks at 30° increments
      for (let a = 0; a < 360; a += 30) {
        const rad = (a - 90) * Math.PI / 180;
        const x1 = SZ/2 + Math.cos(rad) * R * 0.95, y1 = SZ/2 + Math.sin(rad) * R * 0.95;
        const x2 = SZ/2 + Math.cos(rad) * R, y2 = SZ/2 + Math.sin(rad) * R;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      // Radial line from center to ball
      if (px || py) {
        ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(SZ/2, SZ/2); ctx.lineTo(SZ/2 + px, SZ/2 + py); ctx.stroke();
      }
      // Ball — themed gradient
      const J = joyPalette();
      const grad = ctx.createRadialGradient(SZ/2 + px - 6, SZ/2 + py - 6, 4, SZ/2 + px, SZ/2 + py, 18);
      grad.addColorStop(0, J.hi); grad.addColorStop(0.6, J.mid); grad.addColorStop(1, J.lo);
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(SZ/2 + px, SZ/2 + py, 16, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = J.lo; ctx.lineWidth = 2; ctx.stroke();
      // Drive: angle from up (0°) clockwise; speed = radius/R
      const dist = Math.hypot(px, py);
      const speed = Math.min(1, dist / R);
      if (speed < 0.05) { readout.textContent = 'angle 0° · speed 0'; stop(); }
      else {
        const ang = Math.atan2(py, px); // 0 = right, pi/2 = down
        // Convert to fireVec convention: y up = forward
        const xv = Math.cos(ang) * speed;
        const yv = -Math.sin(ang) * speed;
        const deg = ((Math.atan2(px, -py) * 180 / Math.PI) + 360) % 360;
        readout.textContent = 'angle ' + deg.toFixed(0) + '° · speed ' + (speed*100).toFixed(0) + '%';
        fireVec(xv, yv);
      }
      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => { cancelAnimationFrame(raf); host.innerHTML = ''; stop(); };
  }

  // ---- Public registry ------------------------------------------
  window.GamingInputs = {
    aim:        { title: 'Aim & Click',      sub: 'RTS-style click-to-move. Click on the map, robot drives there.',           install: installAim },
    wheel:      { title: 'Wheel + Pedals',   sub: 'Arcade racer: drag the steering wheel, hold ⛽ GAS, tap 🛑 BRAKE.',          install: installWheel },
    spring:     { title: 'Spring Stick',     sub: 'GameCube-style physics — drag, release, the stick springs back to center.',  install: installSpring },
    combo:      { title: 'Combo Keys',       sub: 'Fighting-game inputs. ↑↑ = boost · ←↑→ = arc-right · ↑↓↑↓ = wiggle.',         install: installCombo },
    sequencer:  { title: 'Step Sequencer',   sub: '4×8 rhythm grid. Click cells, hit ▶ Play, robot dances the pattern.',         install: installSequencer },
    traffic:    { title: 'Traffic Light',    sub: '🚦 Tap 🔴 STOP · 🟡 SLOW · 🟢 GO. Toddler-grade.',                            install: installTrafficLight },
    roulette:   { title: 'Roulette',         sub: 'Tap to spin the wheel — robot drives whichever direction it lands on.',       install: installRoulette },
    gesture:    { title: 'Gesture Shapes',   sub: 'Draw ⭕ ▭ ⚡ ∞ — each shape triggers a preset choreography.',                  install: installGesture },
    pendulum:   { title: 'Pendulum',         sub: 'Swing physics — drag the bob to swing it; angle = steer · amplitude = speed.', install: installPendulum },
    polar:      { title: 'Polar Pad',        sub: 'Radial joystick — angle = direction · distance from center = speed.',         install: installPolar },
  };
})();
