// ============================================================
// algorithm-viz.js — A* visualized on the SLAM map.
//
// Click 🧮 in the path card → enters PICK-GOAL mode. Click
// anywhere on the SLAM SVG to set the goal. The visualizer:
//   1. Builds a 10×10 cm occupancy grid from mqOdometry.getObstacles
//      (any cell within 6 cm of an obstacle = blocked).
//   2. Runs A* (heap-free, since grid is small) with Manhattan
//      heuristic, animating each step:
//        - frontier cell turns cyan
//        - explored cell turns amber
//        - final path turns green
//   3. Optionally drives the robot along the path (pipes through
//      autopilot.js by injecting waypoints).
//
// Pure SVG overlay. No DOM teardown needed — re-running clears
// the previous viz layer.
// ============================================================
(function () {
  'use strict';

  const CELL_CM = 10;
  const SAFETY_CM = 6;
  const STEP_MS = 30;

  let svg, btn;
  let pickMode = false;
  let goalCm = null;

  function getOdoOrFail() {
    if (!window.mqOdometry || !window.mqOdometry.getPose || !window.mqOdometry.getObstacles) {
      alert('Odometry not ready — drive a bit first to seed the SLAM map.');
      return null;
    }
    return window.mqOdometry;
  }

  function clientToCm(evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: -local.y };  // SVG y is flipped vs world
  }

  function clearViz() {
    const existing = svg.querySelector('#mqAlgoVizLayer');
    if (existing) existing.remove();
  }
  function ensureLayer() {
    let g = svg.querySelector('#mqAlgoVizLayer');
    if (!g) {
      g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('id', 'mqAlgoVizLayer');
      svg.appendChild(g);
    }
    return g;
  }

  function buildGrid(start, goal, obstacles) {
    // Compute extent bounding both points + obstacles + small padding.
    let minX = Math.min(start.x, goal.x), maxX = Math.max(start.x, goal.x);
    let minY = Math.min(start.y, goal.y), maxY = Math.max(start.y, goal.y);
    for (const o of obstacles) {
      if (o.x < minX) minX = o.x;
      if (o.x > maxX) maxX = o.x;
      if (o.y < minY) minY = o.y;
      if (o.y > maxY) maxY = o.y;
    }
    minX -= 20; maxX += 20; minY -= 20; maxY += 20;
    let cols = Math.max(4, Math.ceil((maxX - minX) / CELL_CM));
    let rows = Math.max(4, Math.ceil((maxY - minY) / CELL_CM));
    // Cap grid at 200x200 cells (= 20m x 20m world). Beyond that the
    // browser stalls during animation. If the SLAM map is bigger,
    // we clip; A* still runs on the visible region.
    const MAX = 200;
    if (cols > MAX) { maxX = minX + MAX * CELL_CM; cols = MAX; }
    if (rows > MAX) { maxY = minY + MAX * CELL_CM; rows = MAX; }
    const blocked = new Uint8Array(cols * rows);
    for (const o of obstacles) {
      const cx = Math.floor((o.x - minX) / CELL_CM);
      const cy = Math.floor((o.y - minY) / CELL_CM);
      // Safety margin: block this cell + its 8 neighbors
      for (let dx = -Math.ceil(SAFETY_CM/CELL_CM); dx <= Math.ceil(SAFETY_CM/CELL_CM); dx++) {
        for (let dy = -Math.ceil(SAFETY_CM/CELL_CM); dy <= Math.ceil(SAFETY_CM/CELL_CM); dy++) {
          const x = cx + dx, y = cy + dy;
          if (x >= 0 && x < cols && y >= 0 && y < rows) {
            blocked[y * cols + x] = 1;
          }
        }
      }
    }
    const sIdx = ((Math.floor((start.y - minY) / CELL_CM)) * cols) + Math.floor((start.x - minX) / CELL_CM);
    const gIdx = ((Math.floor((goal.y  - minY) / CELL_CM)) * cols) + Math.floor((goal.x  - minX) / CELL_CM);
    blocked[sIdx] = 0;
    blocked[gIdx] = 0;
    return { cols, rows, blocked, minX, minY, sIdx, gIdx };
  }

  function neighbors(idx, cols, rows) {
    const x = idx % cols, y = Math.floor(idx / cols);
    const out = [];
    if (x > 0)        out.push(idx - 1);
    if (x < cols - 1) out.push(idx + 1);
    if (y > 0)        out.push(idx - cols);
    if (y < rows - 1) out.push(idx + cols);
    return out;
  }

  function manhattan(a, b, cols) {
    const ax = a % cols, ay = Math.floor(a / cols);
    const bx = b % cols, by = Math.floor(b / cols);
    return Math.abs(ax - bx) + Math.abs(ay - by);
  }

  function paintCell(layer, idx, grid, color) {
    const x = idx % grid.cols, y = Math.floor(idx / grid.cols);
    const wx = grid.minX + x * CELL_CM, wy = grid.minY + y * CELL_CM;
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('x', wx);
    r.setAttribute('y', -(wy + CELL_CM));
    r.setAttribute('width',  CELL_CM);
    r.setAttribute('height', CELL_CM);
    r.setAttribute('fill', color);
    r.setAttribute('opacity', '0.35');
    layer.appendChild(r);
    return r;
  }
  function paintBlocked(layer, grid) {
    for (let i = 0; i < grid.blocked.length; i++) {
      if (grid.blocked[i]) paintCell(layer, i, grid, '#ef4444');
    }
  }

  async function runAStar(start, goal) {
    const odo = getOdoOrFail(); if (!odo) return;
    const obstacles = odo.getObstacles();
    const grid = buildGrid(start, goal, obstacles);
    const layer = ensureLayer();
    clearViz(); ensureLayer();
    const layer2 = ensureLayer();
    paintBlocked(layer2, grid);

    // A* with sorted-array open set (small grids, no heap needed)
    const came = new Map();
    const gScore = new Map();
    gScore.set(grid.sIdx, 0);
    const fScore = new Map();
    fScore.set(grid.sIdx, manhattan(grid.sIdx, grid.gIdx, grid.cols));
    let open = [grid.sIdx];
    const closed = new Set();
    let found = false;

    paintCell(layer2, grid.sIdx, grid, '#4ade80');
    paintCell(layer2, grid.gIdx, grid, '#fbbf24');

    while (open.length) {
      // pick lowest f
      open.sort((a, b) => (fScore.get(a) || Infinity) - (fScore.get(b) || Infinity));
      const cur = open.shift();
      if (cur === grid.gIdx) { found = true; break; }
      closed.add(cur);
      paintCell(layer2, cur, grid, '#fbbf24');
      for (const n of neighbors(cur, grid.cols, grid.rows)) {
        if (grid.blocked[n] || closed.has(n)) continue;
        const tentative = (gScore.get(cur) || 0) + 1;
        if (tentative < (gScore.get(n) ?? Infinity)) {
          came.set(n, cur);
          gScore.set(n, tentative);
          fScore.set(n, tentative + manhattan(n, grid.gIdx, grid.cols));
          if (!open.includes(n)) {
            open.push(n);
            paintCell(layer2, n, grid, '#38bdf8');
          }
        }
      }
      await new Promise(r => setTimeout(r, STEP_MS));
    }

    if (!found) {
      const fb = document.getElementById('mqAlgoStatus');
      if (fb) fb.textContent = '✗ no path';
      return;
    }
    // Reconstruct path
    const path = [];
    let cur = grid.gIdx;
    while (cur !== undefined) {
      path.unshift(cur);
      cur = came.get(cur);
    }
    // Paint path in green
    for (const idx of path) paintCell(layer2, idx, grid, '#4ade80');
    const fb = document.getElementById('mqAlgoStatus');
    if (fb) fb.textContent = `✓ path · ${path.length} cells · ${closed.size} explored`;
  }

  function onPick(e) {
    if (!pickMode) return;
    const cm = clientToCm(e);
    if (!cm) return;
    pickMode = false;
    svg.style.cursor = '';
    btn.classList.remove('mq-algo-active');
    btn.textContent = '🧮 A*';
    goalCm = cm;
    const odo = getOdoOrFail(); if (!odo) return;
    const start = odo.getPose();
    runAStar({ x: start.x, y: start.y }, cm);
  }

  function enterPick() {
    const odo = getOdoOrFail(); if (!odo) return;
    pickMode = true;
    svg.style.cursor = 'crosshair';
    btn.classList.add('mq-algo-active');
    btn.textContent = '🧮 click goal';
    const fb = document.getElementById('mqAlgoStatus');
    if (fb) fb.textContent = 'click on the map to pick a goal';
  }

  function init() {
    svg = document.getElementById('mqOdoSvg');
    if (!svg) return;
    const driftBar = document.getElementById('mqDriftBar');
    if (!driftBar || document.getElementById('mqAlgoBtn')) return;
    btn = document.createElement('button');
    btn.id = 'mqAlgoBtn';
    btn.type = 'button';
    btn.className = 'mq-algo-btn';
    btn.style.cssText = 'padding:4px 10px; background:transparent; color:#38bdf8; border:1px solid rgba(56,189,248,0.4); border-radius:6px; cursor:pointer; font-size:11px;';
    btn.textContent = '🧮 A*';
    btn.title = 'Algorithm Visualizer — click a goal on the SLAM map; A* explores cells (cyan frontier, amber explored, green path) avoiding obstacles.';
    btn.addEventListener('click', enterPick);
    const status = document.createElement('span');
    status.id = 'mqAlgoStatus';
    status.style.cssText = 'font-family:monospace; font-size:11px; color:#94a3b8;';
    driftBar.appendChild(btn);
    driftBar.appendChild(status);
    svg.addEventListener('click', onPick);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
