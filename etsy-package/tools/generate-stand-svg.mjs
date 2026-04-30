/**
 * Lasercut acrylic desk stand for the BBC micro:bit V2.
 *
 * Generates a print-ready SVG (1 SVG unit = 1 mm) with 2 interlocking
 * pieces laid flat for a 3mm acrylic sheet. Black 0.1mm strokes = cut
 * lines (standard convention for most laser cutters / K40 / Glowforge /
 * xTool). No fills, no engraves, no text — import into LightBurn /
 * xTool Creative Space / LaserGRBL and cut at your material's settings.
 *
 * The stand holds a micro:bit V2 upright via friction fit in the
 * UPRIGHT piece's top slot, with a USB-C cable channel in the BASE.
 *
 * Pieces:
 *   BASE     100 × 70 mm — flat platform with a 52×3 mm slot
 *                          for the upright, plus a 15×8 mm cable notch.
 *   UPRIGHT   70 × 70 mm — vertical panel with a 52×3 mm bottom tab
 *                          (slots into BASE) and a 46×34 mm window
 *                          centered on the upper half (micro:bit shows
 *                          through; clipped by 4 small edge tabs).
 *
 * Usage:
 *   node etsy-package/tools/generate-stand-svg.mjs [thickness_mm]
 *     (default = 3 mm)
 *
 * Output:
 *   output/stand/stand-{thickness}mm.svg   (lasercut-ready)
 *   output/stand/stand-{thickness}mm.dxf   (DXF twin, R12 minimal)
 *   output/stand/README.md                 (assembly guide)
 */

import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', 'output', 'shared', 'stand');
mkdirSync(OUT, { recursive: true });

const T = parseFloat(process.argv[2]) || 3;       // material thickness mm
const GAP = 10;                                   // gap between pieces in the sheet
const STROKE = 0.1;                               // mm — hairline cut
const MARGIN = 5;                                 // sheet margin

// --- micro:bit V2 physical dimensions ---
const MB_W = 52, MB_H = 43;                        // full board
// Leave 3mm inset all around so bezel holds the board, not crushing it.
const WINDOW_W = MB_W - 6;
const WINDOW_H = MB_H - 6;

// --- piece dimensions ---
const BASE_W = 100, BASE_H = 70;
const UPR_W  = 70,  UPR_H  = 70;

// Tab/slot: should equal the mating piece's thickness T.
const TAB_W = 52;   // visible tab width
const TAB_H = T;    // matches material thickness

// Cable notch in base (front edge)
const CABLE_W = 15, CABLE_D = 8;

// Window on upright (centered on upper half)
const WIN_W = WINDOW_W;
const WIN_H = WINDOW_H;
const WIN_X_OFFSET = (UPR_W - WIN_W) / 2;
const WIN_Y_OFFSET = 14;  // from top

// Slot on base for upright's tab (centered)
const SLOT_X_OFFSET = (BASE_W - TAB_W) / 2;
const SLOT_Y_OFFSET = (BASE_H - T) / 2;

// --- helpers ---
function rect(x, y, w, h) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="black" stroke-width="${STROKE}"/>`;
}

function basePiece(ox, oy) {
  // Outer rectangle
  const outer = rect(ox, oy, BASE_W, BASE_H);
  // Inner slot (full cut-out for upright's tab)
  const slot = rect(ox + SLOT_X_OFFSET, oy + SLOT_Y_OFFSET, TAB_W, T);
  // Cable notch: subtractive rectangle on the front edge
  // drawn as path for a clean union with outer; but simpler: draw an
  // inset outer rectangle + cable rect as a separate cut piece of the
  // outline by drawing the base as a polygon.
  const cnX = ox + (BASE_W - CABLE_W) / 2;
  const cnY = oy + BASE_H;
  // Outline polygon: top-left → top-right → bottom-right → cable-notch-right-top
  //                  → cable-notch-right-bottom → cable-notch-left-bottom
  //                  → cable-notch-left-top → bottom-left → close
  const poly = `<polygon fill="none" stroke="black" stroke-width="${STROKE}" points="${
    ox},${oy} ${ox + BASE_W},${oy} ${ox + BASE_W},${oy + BASE_H} ${
      cnX + CABLE_W},${oy + BASE_H} ${cnX + CABLE_W},${oy + BASE_H - CABLE_D} ${
        cnX},${oy + BASE_H - CABLE_D} ${cnX},${oy + BASE_H} ${ox},${oy + BASE_H}
  "/>`;
  return poly + '\n  ' + slot;
}

function uprightPiece(ox, oy) {
  // Upright has a tab sticking DOWN. Main body: UPR_W × UPR_H. Tab: TAB_W × T
  // extending from the bottom edge center.
  const tabX = ox + (UPR_W - TAB_W) / 2;
  const tabY = oy + UPR_H;
  const poly = `<polygon fill="none" stroke="black" stroke-width="${STROKE}" points="${
    ox},${oy} ${ox + UPR_W},${oy} ${ox + UPR_W},${oy + UPR_H} ${
      tabX + TAB_W},${oy + UPR_H} ${tabX + TAB_W},${tabY + T} ${
        tabX},${tabY + T} ${tabX},${oy + UPR_H} ${ox},${oy + UPR_H}
  "/>`;
  // Window cutout for micro:bit
  const win = rect(ox + WIN_X_OFFSET, oy + WIN_Y_OFFSET, WIN_W, WIN_H);
  // Four small round holes at window corners for micro:bit screw posts (optional)
  const holeR = 1.8;
  const holes = [
    [WIN_X_OFFSET - 4, WIN_Y_OFFSET - 4],
    [WIN_X_OFFSET + WIN_W + 4, WIN_Y_OFFSET - 4],
    [WIN_X_OFFSET - 4, WIN_Y_OFFSET + WIN_H + 4],
    [WIN_X_OFFSET + WIN_W + 4, WIN_Y_OFFSET + WIN_H + 4],
  ].map(([dx, dy]) => `<circle cx="${ox + dx}" cy="${oy + dy}" r="${holeR}" fill="none" stroke="black" stroke-width="${STROKE}"/>`).join('\n  ');
  return poly + '\n  ' + win + '\n  ' + holes;
}

// --- lay out the sheet ---
const sheetW = MARGIN * 2 + BASE_W + GAP + UPR_W;
const sheetH = MARGIN * 2 + Math.max(BASE_H, UPR_H + T);   // upright's tab hangs below

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  Maqueen Lab — Acrylic Desk Stand (${T} mm)
  Cut all visible lines in ${T} mm acrylic. Assemble by sliding the
  upright's tab into the base's slot. Friction fit — no glue needed.
-->
<svg xmlns="http://www.w3.org/2000/svg"
     width="${sheetW}mm" height="${sheetH}mm"
     viewBox="0 0 ${sheetW} ${sheetH}">
  ${basePiece(MARGIN, MARGIN)}
  ${uprightPiece(MARGIN + BASE_W + GAP, MARGIN)}
</svg>`;

// --- simple DXF (R12 minimal — one LINE per edge, CIRCLE for holes) ---
// Most laser software also accepts SVG, but some older proprietary tools
// want DXF. This writes a minimal compliant R12 DXF.

function lineDxf(x1, y1, x2, y2) {
  return ['0', 'LINE', '8', '0', '10', x1, '20', -y1, '11', x2, '21', -y2].join('\n');
}
function circleDxf(cx, cy, r) {
  return ['0', 'CIRCLE', '8', '0', '10', cx, '20', -cy, '40', r].join('\n');
}
function polyEdges(points) {
  const lines = [];
  for (let i = 0; i < points.length; i++) {
    const [a, b] = [points[i], points[(i + 1) % points.length]];
    lines.push(lineDxf(a[0], a[1], b[0], b[1]));
  }
  return lines.join('\n');
}

// BASE
const bOx = MARGIN, bOy = MARGIN;
const cnX = bOx + (BASE_W - CABLE_W) / 2;
const basePts = [
  [bOx, bOy], [bOx + BASE_W, bOy], [bOx + BASE_W, bOy + BASE_H],
  [cnX + CABLE_W, bOy + BASE_H], [cnX + CABLE_W, bOy + BASE_H - CABLE_D],
  [cnX, bOy + BASE_H - CABLE_D], [cnX, bOy + BASE_H],
  [bOx, bOy + BASE_H],
];
const baseSlotPts = (() => {
  const sx = bOx + SLOT_X_OFFSET, sy = bOy + SLOT_Y_OFFSET;
  return [[sx, sy], [sx + TAB_W, sy], [sx + TAB_W, sy + T], [sx, sy + T]];
})();

// UPRIGHT
const uOx = MARGIN + BASE_W + GAP, uOy = MARGIN;
const tabX = uOx + (UPR_W - TAB_W) / 2;
const uprPts = [
  [uOx, uOy], [uOx + UPR_W, uOy], [uOx + UPR_W, uOy + UPR_H],
  [tabX + TAB_W, uOy + UPR_H], [tabX + TAB_W, uOy + UPR_H + T],
  [tabX, uOy + UPR_H + T], [tabX, uOy + UPR_H],
  [uOx, uOy + UPR_H],
];
const winPts = (() => {
  const wx = uOx + WIN_X_OFFSET, wy = uOy + WIN_Y_OFFSET;
  return [[wx, wy], [wx + WIN_W, wy], [wx + WIN_W, wy + WIN_H], [wx, wy + WIN_H]];
})();
const holeList = [
  [uOx + WIN_X_OFFSET - 4, uOy + WIN_Y_OFFSET - 4],
  [uOx + WIN_X_OFFSET + WIN_W + 4, uOy + WIN_Y_OFFSET - 4],
  [uOx + WIN_X_OFFSET - 4, uOy + WIN_Y_OFFSET + WIN_H + 4],
  [uOx + WIN_X_OFFSET + WIN_W + 4, uOy + WIN_Y_OFFSET + WIN_H + 4],
];

const dxf = `0
SECTION
2
ENTITIES
${polyEdges(basePts)}
${polyEdges(baseSlotPts)}
${polyEdges(uprPts)}
${polyEdges(winPts)}
${holeList.map(([cx, cy]) => circleDxf(cx, cy, 1.8)).join('\n')}
0
ENDSEC
0
EOF`;

const svgPath = join(OUT, `stand-${T}mm.svg`);
const dxfPath = join(OUT, `stand-${T}mm.dxf`);
writeFileSync(svgPath, svg);
writeFileSync(dxfPath, dxf);

const readme = `# micro:bit V2 Acrylic Desk Stand — Laser-Cut Files

Two-piece flat-pack desk stand designed for **${T} mm acrylic**. Assembles in
under a minute, no glue needed — friction fit via the tab/slot joint.

## Files

- \`stand-${T}mm.svg\` — cut file for LightBurn, xTool Creative Space,
  Glowforge, LaserGRBL, most commercial laser software.
- \`stand-${T}mm.dxf\` — DXF twin for older CNC software that doesn't
  accept SVG.

## Pieces (${sheetW} × ${sheetH} mm sheet)

| Piece | Dimensions | Role |
|---|---|---|
| BASE | ${BASE_W} × ${BASE_H} mm | Platform with upright slot + cable notch |
| UPRIGHT | ${UPR_W} × ${UPR_H} mm (+${T} mm tab) | Vertical panel with micro:bit window |

**Window cutout** on upright: ${WIN_W} × ${WIN_H} mm — slightly smaller than
the micro:bit V2 (52 × 43 mm) so a 3 mm bezel holds the board visually.
4 × Ø3.6 mm corner holes are provided for M3 screws if you want positive
fastening instead of friction.

## Laser settings (starting points)

Every laser is different. For **3 mm cast clear acrylic**:

- **K40-class CO2 (40 W)**: 10 mm/s @ 70 % power, 1-2 passes
- **xTool D1 (10 W diode)**: Acrylic is opaque to blue — paint matte black first
- **Glowforge Plus/Pro**: "Proofgrade clear acrylic 3 mm" preset

**Always test-cut on a 10 mm offcut first.** Acrylic varies in thickness;
if your tab doesn't seat flush, add 0.1 mm to the slot width and re-cut.

## Assembly

1. Remove the masking paper from both pieces.
2. Hold the UPRIGHT vertical, BASE flat below it.
3. Guide the UPRIGHT's bottom tab into the BASE's central slot.
4. Press firmly — a small click means seated.
5. Slide the micro:bit V2 into the window from above. The 3 mm bezel
   holds it; the USB cable slot at the base runs the cable cleanly away.

## Customization

Regenerate with a different material thickness:

\`\`\`
node etsy-package/tools/generate-stand-svg.mjs 5     # for 5 mm acrylic
\`\`\`

All joints auto-scale to the new thickness.

## Licensing

These files ship under the same license as the parent Etsy product. Free
use by the buyer for personal classroom use. Commercial resale of the
cut stand is not permitted.
`;
writeFileSync(join(OUT, 'README.md'), readme);

console.log(`\n✂️  Lasercut stand generated (${T} mm acrylic, ${sheetW}×${sheetH} mm sheet)`);
console.log(`  ✓ ${svgPath}`);
console.log(`  ✓ ${dxfPath}`);
console.log(`  ✓ ${join(OUT, 'README.md')}\n`);
