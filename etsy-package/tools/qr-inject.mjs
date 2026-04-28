/**
 * Inject per-printable QR codes linking to the live demo with UTM tags.
 *
 * Each printable (classroom-poster, quickstart-card, etc.) gets a small QR
 * image embedded into a bottom-right corner block. Scanning → live demo
 * URL with utm_medium = <printable slug>, so Etsy Stats can attribute
 * traffic to whichever printable got scanned.
 *
 * Modes:
 *   --preview   (default) — write QR-injected copies to
 *                 etsy-package/output/printables-with-qr/
 *   --inplace   — modify the source printable HTMLs in etsy-package/
 *                 directly. Reversible via git.
 *
 * Usage:
 *   node etsy-package/seller-only/qr-inject.mjs [--inplace]
 */

import QRCode from 'qrcode';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG  = resolve(__dirname, '..');
const OUT  = resolve(PKG, 'output', 'shared', 'printables-with-qr');
const INPLACE = process.argv.includes('--inplace');
if (!INPLACE) mkdirSync(OUT, { recursive: true });

const BASE_URL = 'https://abourdim.github.io/bit-playground/';
const CAMPAIGN = 'etsy';

// printable → UTM medium + a human caption for the QR block.
const PRINTABLES = [
  { file: 'classroom-poster.html',      medium: 'classroom-poster',   caption: 'Scan to try the live demo' },
  { file: 'quickstart-card.html',       medium: 'quickstart-card',    caption: 'Live demo · Chrome / Edge' },
  { file: 'shortcuts-cheatsheet.html',  medium: 'shortcuts-cheatsheet', caption: 'Open on your computer' },
  { file: 'lesson-plan-template.html',  medium: 'lesson-plan',        caption: 'Try before you teach' },
  { file: 'sticker-sheet.html',         medium: 'sticker-sheet',      caption: 'Live demo' },
  { file: 'README-quickstart.html',     medium: 'readme-quickstart',  caption: 'Run it now — no install' },
];

const BLOCK_MARKER_START = '<!-- QR-BLOCK-START -->';
const BLOCK_MARKER_END   = '<!-- QR-BLOCK-END -->';

function buildQrBlock(dataUrl, shortUrl, caption) {
  return `${BLOCK_MARKER_START}
<div style="position:fixed;right:12mm;bottom:12mm;display:flex;gap:8mm;align-items:center;
  background:rgba(10,14,18,0.92);color:#e8ffe8;padding:4mm 5mm;border-radius:3mm;
  box-shadow:0 2mm 6mm rgba(0,0,0,0.35);font-family:-apple-system,Segoe UI,sans-serif;
  max-width:80mm;z-index:9999;">
  <img src="${dataUrl}" alt="QR code — scan to open live demo" style="width:24mm;height:24mm;background:#fff;padding:1mm;border-radius:1.5mm;display:block;"/>
  <div style="display:flex;flex-direction:column;gap:1mm;min-width:0;">
    <div style="font-weight:700;font-size:9pt;color:#00ff88;line-height:1.2;">${caption}</div>
    <div style="font-size:7pt;opacity:0.75;line-height:1.3;word-break:break-all;">${shortUrl}</div>
  </div>
</div>
${BLOCK_MARKER_END}`;
}

function stripExistingBlock(html) {
  const re = new RegExp(`${BLOCK_MARKER_START}[\\s\\S]*?${BLOCK_MARKER_END}`, 'g');
  return html.replace(re, '').replace(/\n{3,}/g, '\n\n');
}

function injectBlock(html, block) {
  // Insert just before </body>; fallback: append.
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${block}\n</body>`);
  return html + '\n' + block;
}

console.log(`\n🔳 Generating QR-injected printables (${INPLACE ? 'in-place' : 'preview'})\n`);

for (const p of PRINTABLES) {
  const src = resolve(PKG, p.file);
  const targetUrl = `${BASE_URL}?utm_source=print&utm_medium=${p.medium}&utm_campaign=${CAMPAIGN}`;
  const shortUrl  = BASE_URL.replace(/^https?:\/\//, '');
  // 512px PNG → ~24mm print @ 600dpi. Margin 1 for denser print.
  const dataUrl = await QRCode.toDataURL(targetUrl, { width: 512, margin: 1, errorCorrectionLevel: 'M' });

  let html;
  try { html = readFileSync(src, 'utf8'); }
  catch { console.log(`  ⚠️  missing: ${p.file}`); continue; }

  const cleaned = stripExistingBlock(html);
  const block = buildQrBlock(dataUrl, shortUrl, p.caption);
  const next = injectBlock(cleaned, block);

  const dest = INPLACE ? src : join(OUT, p.file);
  writeFileSync(dest, next);
  console.log(`  ✓ ${p.file} → ${p.medium}`);
}

console.log(INPLACE
  ? '\n✅ Source printables updated. Revert with `git checkout`.'
  : `\n✅ Preview written to ${OUT}\n   Review, then re-run with --inplace to commit.`);
