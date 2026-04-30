// ============================================================
// stack-flow.js — Live "BLE stack" visualizer.
//
// Subscribes to bleScheduler events and spawns a glowing dot that
// travels through the 6 stages drawn in #mqStackFlowSvg:
//   🌐 Browser → ⏳ Queue → 📡 BLE → 🤖 micro:bit → ⚙️ Driver → 🎯 Output
//
// Lifecycle of a particle:
//   send()   → spawn dot at Browser, animate Browser → Queue → BLE
//                (it lives there until the GATT write actually fires)
//   echo     → resume animation BLE → micro:bit → Driver → Output (green)
//   timeout/err → mark red, fade out from current position
//
// All particles are SVG <circle>s; we animate via transform attribute
// so we don't churn DOM + we get hardware-accelerated paint.
// ============================================================

(function () {
  'use strict';

  // X-coordinates of the 6 stage nodes (must match index.html SVG).
  const STAGES = [40, 144, 248, 352, 456, 560];
  const Y = 30;

  // Pending particles by sequence number (so echo can find its dot).
  const inFlight = new Map();

  let stats = { echoed: 0, sent: 0, lastLatency: 0 };

  function svg() { return document.getElementById('mqStackFlowParticles'); }
  function statsEl() { return document.getElementById('mqStackFlowStats'); }

  function refreshStats() {
    const s = statsEl();
    if (!s) return;
    s.textContent =
      (stats.lastLatency ? stats.lastLatency + ' ms' : '— ms') +
      ' · ' + stats.echoed + ' / ' + stats.sent;
  }

  // Animate a circle's `transform="translate(x y)"` from x0 to x1 over `ms`.
  // Returns a Promise that resolves when the animation ends.
  function moveTo(circle, fromX, toX, ms) {
    return new Promise(resolve => {
      const start = performance.now();
      function tick(now) {
        const t = Math.min(1, (now - start) / ms);
        const x = fromX + (toX - fromX) * t;
        circle.setAttribute('cx', x.toFixed(1));
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      }
      requestAnimationFrame(tick);
    });
  }

  function makeParticle() {
    const layer = svg();
    if (!layer) return null;
    const NS = 'http://www.w3.org/2000/svg';
    const halo = document.createElementNS(NS, 'circle');
    halo.setAttribute('cx', STAGES[0]);
    halo.setAttribute('cy', Y);
    halo.setAttribute('r', 8);
    halo.setAttribute('fill', '#fbbf24');
    halo.setAttribute('opacity', '0.25');
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', STAGES[0]);
    dot.setAttribute('cy', Y);
    dot.setAttribute('r', 4);
    dot.setAttribute('fill', '#fbbf24');
    layer.appendChild(halo);
    layer.appendChild(dot);
    return { halo, dot };
  }

  function fadeOutAndRemove(p, color) {
    if (!p) return;
    if (color) {
      p.dot.setAttribute('fill', color);
      p.halo.setAttribute('fill', color);
    }
    p.dot.style.transition = 'opacity 0.5s';
    p.halo.style.transition = 'opacity 0.5s';
    requestAnimationFrame(() => {
      p.dot.style.opacity = '0';
      p.halo.style.opacity = '0';
    });
    setTimeout(() => {
      try { p.dot.remove(); } catch {}
      try { p.halo.remove(); } catch {}
    }, 600);
  }

  // Move both halo and dot in lockstep.
  async function travelTo(p, toIdx, ms) {
    if (!p) return;
    const fromX = +p.dot.getAttribute('cx');
    const toX = STAGES[toIdx];
    await Promise.all([
      moveTo(p.dot,  fromX, toX, ms),
      moveTo(p.halo, fromX, toX, ms),
    ]);
  }

  function init() {
    if (!window.bleScheduler || !window.bleScheduler.on) {
      setTimeout(init, 200);
      return;
    }
    // Wrap send() so we can spawn a particle BEFORE the scheduler queues.
    // We don't replace it — we listen to its events instead, which is simpler.
    // Each tx without a response handler is a fire-and-forget. We learn the
    // sequence number from the 'echo' event (which carries seq + verb + latency).
    // For TX-side spawn we patch send() once.
    const origSend = window.bleScheduler.send;
    window.bleScheduler.send = function (verb, opts) {
      const result = origSend.call(this, verb, opts);
      // Spawn a particle and animate Browser → Queue → BLE.
      // We tag it with a "pending" key so when an echo arrives we can
      // continue its animation BLE → micro:bit → Driver → Output.
      const p = makeParticle();
      if (p) {
        stats.sent++;
        refreshStats();
        // Browser (0) → Queue (1) → BLE (2). Hold at BLE until echo.
        (async () => {
          await travelTo(p, 1, 180);
          await travelTo(p, 2, 180);
          // If no echo within 1.5s, bleed out as timeout (red)
          p._timeoutT = setTimeout(() => {
            if (p._done) return;
            fadeOutAndRemove(p, '#f87171');
          }, 1700);
          // Park it in inFlight indexed by verb so 'echo' can find it.
          // For sequence-numbered verbs we'll get { seq, verb, latency }.
          // Use a FIFO array to handle multiple in-flight with same verb.
          const key = verb.split(':')[0];
          if (!inFlight.has(key)) inFlight.set(key, []);
          inFlight.get(key).push(p);
        })();
      }
      return result;
    };

    window.bleScheduler.on('echo', (info) => {
      // Find the oldest matching particle for this verb prefix
      const key = (info && info.verb || '').split(':')[0];
      const queue = inFlight.get(key);
      if (!queue || !queue.length) return;
      const p = queue.shift();
      if (!p) return;
      clearTimeout(p._timeoutT);
      p._done = true;
      stats.echoed++;
      stats.lastLatency = Math.round(info.latency || 0);
      refreshStats();
      // Color green (success) and finish the journey
      p.dot.setAttribute('fill', '#4ade80');
      p.halo.setAttribute('fill', '#4ade80');
      (async () => {
        await travelTo(p, 3, 200);   // micro:bit
        await travelTo(p, 4, 200);   // driver
        await travelTo(p, 5, 220);   // output
        fadeOutAndRemove(p, '#4ade80');
      })();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
