/**
 * Generate print-ready poster (A3 portrait) + flyer (A4 portrait) per
 * language. Each lang gets both a PNG preview (300 DPI) and a vector PDF
 * suitable for print shops.
 *
 * Strings come from print-specs.json. RTL (ar) is auto-handled via
 * dir="rtl" + Tajawal font.
 *
 * Usage:
 *   node etsy-package/tools/generate-print.mjs --lang en
 *   node etsy-package/tools/generate-print.mjs --lang fr
 *   node etsy-package/tools/generate-print.mjs --lang ar
 *
 * Outputs → etsy-package/output/<lang>/print/
 *   poster-a3.png   poster-a3.pdf
 *   flyer-a4.png    flyer-a4.pdf
 */

import { chromium } from '@playwright/test';
import QRCode from 'qrcode';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(__dirname, '..');

const argLangIdx = process.argv.indexOf('--lang');
const LANG = argLangIdx > 0 ? process.argv[argLangIdx + 1] : 'en';

const SPECS = JSON.parse(readFileSync(join(__dirname, 'print-specs.json'), 'utf8'));
const S = SPECS[LANG];
if (!S) { console.error(`❌ No print-specs entry for lang=${LANG}`); process.exit(1); }
const C = SPECS.common;

const SHOTS = resolve(PKG, 'output', LANG, 'screenshots');
const OUT = resolve(PKG, 'output', LANG, 'print');
mkdirSync(OUT, { recursive: true });

const DIR = LANG === 'ar' ? 'rtl' : 'ltr';
const FONT = LANG === 'ar' ? `'Tajawal', 'Inter', sans-serif` : `'Inter', system-ui, sans-serif`;

// Resolve screenshot → file:// URL; fall back to shared if lang version missing.
function shot(name) {
  const p = join(SHOTS, name);
  if (existsSync(p)) return 'file://' + p.replace(/\\/g, '/');
  const fallback = join(PKG, 'output', 'en', 'screenshots', name);
  return 'file://' + fallback.replace(/\\/g, '/');
}

const qrDataUrl = await QRCode.toDataURL(C.qrUrl, { margin: 1, width: 600, color: { dark: '#020617', light: '#ffffff' } });

// ─────────────────────────────────────────────────────────────────────────
// POSTER (A3 portrait, 297 x 420 mm)
// ─────────────────────────────────────────────────────────────────────────
function posterHtml() {
  return `<!DOCTYPE html>
<html lang="${LANG}" dir="${DIR}"><head><meta charset="UTF-8"><style>
  @import url('https://fonts.googleapis.com/css2?family=Righteous&family=Orbitron:wght@500;700&family=Inter:wght@400;600;800;900&family=Tajawal:wght@400;700;900&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: A3 portrait; margin: 0; }
  html, body { width: 297mm; height: 420mm; }
  body {
    font-family: ${FONT};
    background: #020617;
    color: #e8ffe8;
    overflow: hidden;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .page { width: 297mm; height: 420mm; padding: 16mm 18mm 60mm; position: relative; overflow: hidden; }
  .page::before {
    content: ''; position: absolute; inset: 0; pointer-events: none;
    background:
      radial-gradient(circle at 18% 12%, rgba(34,197,94,.18) 0%, transparent 45%),
      radial-gradient(circle at 85% 88%, rgba(34,211,238,.12) 0%, transparent 55%);
  }
  .page::after {
    content: ''; position: absolute; inset: 10mm;
    border: 1.5px solid rgba(34,197,94,.2); border-radius: 8mm;
    pointer-events: none;
  }

  .kicker {
    font-family: 'Orbitron', monospace; font-size: 11pt;
    color: #22d3ee; letter-spacing: 0.25em;
    margin-bottom: 4mm;
    ${LANG === 'ar' ? 'font-family: Inter, monospace;' : ''}
  }
  .title {
    font-family: ${LANG === 'ar' ? `'Tajawal', sans-serif` : `'Orbitron', 'Inter', sans-serif`};
    font-size: ${LANG === 'ar' ? '62pt' : '56pt'};
    font-weight: ${LANG === 'ar' ? '900' : '700'};
    color: #22c55e;
    line-height: 1.05;
    letter-spacing: ${LANG === 'ar' ? 'normal' : '-0.02em'};
    text-shadow: 0 0 40px rgba(34,197,94,.3);
    white-space: pre-line;
    max-width: 240mm;
  }
  .subtitle {
    font-size: ${LANG === 'ar' ? '18pt' : '16pt'};
    font-weight: 600;
    color: #cbd5e1;
    margin-top: 6mm;
    line-height: 1.35;
    max-width: 240mm;
  }

  .hero-shot {
    margin: 8mm auto 0;
    width: 100%; max-width: 235mm; height: 180mm;
    border-radius: 4mm; overflow: hidden;
    box-shadow: 0 8mm 20mm rgba(0,0,0,.55), 0 0 0 1.5px rgba(34,197,94,.25);
    background: #000;
  }
  .hero-shot img { width: 100%; height: 100%; object-fit: cover; object-position: center top; display: block; }

  .features {
    display: flex; gap: 5mm; margin-top: 6mm;
    margin-bottom: 55mm;
  }
  .feat {
    flex: 1;
    background: rgba(15,23,42,.75);
    border: 1px solid rgba(34,197,94,.18);
    border-radius: 4mm;
    padding: 5mm 4mm;
  }
  .feat .icon { font-size: 22pt; display: block; margin-bottom: 2mm; }
  .feat h3 { color: #22c55e; font-size: 14pt; font-weight: 800; margin-bottom: 2mm; }
  .feat p { color: #94a3b8; font-size: 10pt; line-height: 1.4; }

  .qr-block {
    position: absolute; bottom: 14mm; ${DIR === 'rtl' ? 'left' : 'right'}: 18mm;
    display: flex; align-items: center; gap: 5mm;
    background: rgba(10,14,18,.92); color: #e8ffe8;
    padding: 5mm 6mm; border-radius: 3mm;
    border: 1px solid rgba(34,197,94,.3);
  }
  .qr-block img { width: 32mm; height: 32mm; background: #fff; padding: 1mm; border-radius: 1mm; display: block; }
  .qr-block .qr-caption { font-weight: 700; font-size: 11pt; color: #22c55e; line-height: 1.2; margin-bottom: 1.5mm; }
  .qr-block .qr-url { font-family: 'Orbitron', monospace; font-size: 8pt; color: #94a3b8; letter-spacing: 0.05em; }

  .footer {
    position: absolute; bottom: 14mm; ${DIR === 'rtl' ? 'right' : 'left'}: 18mm;
    max-width: 120mm;
  }
  .footer .left { font-size: 9pt; color: #64748b; }
  .footer .brand { font-family: 'Orbitron', monospace; font-size: 11pt; color: #22c55e; letter-spacing: 0.12em; margin-top: 2mm; }
</style></head>
<body><div class="page">
  <div class="kicker">${S.posterKicker}</div>
  <div class="title">${S.posterTitle}</div>
  <div class="subtitle">${S.posterSubtitle}</div>

  <div class="hero-shot"><img src="${shot(C.screenshots.teacher)}"></div>

  <div class="features">
    ${S.features.map(f => `
    <div class="feat">
      <span class="icon">${f.icon}</span>
      <h3>${f.h}</h3>
      <p>${f.p}</p>
    </div>`).join('')}
  </div>

  <div class="qr-block">
    <img src="${qrDataUrl}">
    <div>
      <div class="qr-caption">${S.qrCaption}</div>
      <div class="qr-url">${C.url}</div>
    </div>
  </div>

  <div class="footer">
    <div class="left">${S.footerLeft}<br>${S.footerRight}</div>
    <div class="brand">${S.brand}</div>
  </div>
</div></body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────
// FLYER (A4 portrait, 210 x 297 mm)
// ─────────────────────────────────────────────────────────────────────────
function flyerHtml() {
  return `<!DOCTYPE html>
<html lang="${LANG}" dir="${DIR}"><head><meta charset="UTF-8"><style>
  @import url('https://fonts.googleapis.com/css2?family=Righteous&family=Orbitron:wght@500;700&family=Inter:wght@400;600;800;900&family=Tajawal:wght@400;700;900&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: A4 portrait; margin: 0; }
  html, body { width: 210mm; height: 297mm; }
  body {
    font-family: ${FONT};
    background: #020617;
    color: #e8ffe8;
    overflow: hidden;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .page { width: 210mm; height: 297mm; padding: 14mm 14mm; position: relative; overflow: hidden; }
  .page::before {
    content: ''; position: absolute; inset: 0; pointer-events: none;
    background:
      radial-gradient(circle at 85% 10%, rgba(34,197,94,.14) 0%, transparent 50%),
      radial-gradient(circle at 10% 95%, rgba(34,211,238,.10) 0%, transparent 55%);
  }

  .top {
    display: flex; justify-content: space-between; align-items: flex-start;
    margin-bottom: 4mm;
  }
  .brand-mark {
    font-family: 'Orbitron', monospace; font-size: 9pt;
    color: #22d3ee; letter-spacing: 0.2em;
  }
  .badge {
    background: #22c55e; color: #020617;
    padding: 1.5mm 4mm; border-radius: 999px;
    font-size: 9pt; font-weight: 800; letter-spacing: 0.05em;
  }

  .title {
    font-family: ${LANG === 'ar' ? `'Tajawal', sans-serif` : `'Orbitron', 'Inter', sans-serif`};
    font-size: ${LANG === 'ar' ? '34pt' : '30pt'};
    font-weight: ${LANG === 'ar' ? '900' : '700'};
    color: #22c55e;
    line-height: 1.05;
    letter-spacing: ${LANG === 'ar' ? 'normal' : '-0.02em'};
    white-space: pre-line;
  }
  .tagline {
    font-size: 13pt; font-weight: 600; color: #22d3ee;
    margin-top: 2.5mm;
  }
  .subtitle {
    font-size: 10.5pt; color: #cbd5e1;
    margin-top: 2mm; line-height: 1.4;
  }

  .shot-row {
    display: flex; gap: 3mm; margin: 6mm 0 5mm;
  }
  .shot-row .shot {
    flex: 1; border-radius: 2mm; overflow: hidden;
    box-shadow: 0 4mm 10mm rgba(0,0,0,.5), 0 0 0 1px rgba(34,197,94,.2);
    background: #000;
  }
  .shot-row .shot img { width: 100%; display: block; }

  .steps-block {
    background: rgba(15,23,42,.7);
    border: 1px solid rgba(34,197,94,.18);
    border-radius: 3mm;
    padding: 5mm 6mm;
    margin-bottom: 4mm;
  }
  .steps-block h2 {
    font-family: ${LANG === 'ar' ? `'Tajawal', sans-serif` : `'Orbitron', sans-serif`};
    font-size: 13pt; color: #22c55e;
    margin-bottom: 3mm; letter-spacing: 0.02em;
  }
  .steps { list-style: none; counter-reset: s; }
  .steps li {
    counter-increment: s;
    padding: 1.5mm 0 1.5mm ${DIR === 'rtl' ? '0' : '10mm'};
    padding-${DIR === 'rtl' ? 'right' : 'left'}: 10mm;
    position: relative;
    font-size: 10.5pt; color: #cbd5e1; line-height: 1.4;
    border-bottom: 1px dashed rgba(34,197,94,.1);
  }
  .steps li:last-child { border-bottom: none; }
  .steps li::before {
    content: counter(s);
    position: absolute; ${DIR === 'rtl' ? 'right' : 'left'}: 0; top: 1.5mm;
    width: 6mm; height: 6mm;
    background: linear-gradient(135deg, #22c55e, #15803d);
    color: #020617; border-radius: 50%;
    font-family: 'Orbitron', monospace; font-size: 9pt; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
  }

  .features {
    display: flex; gap: 3mm; margin-bottom: 4mm;
  }
  .feat {
    flex: 1;
    background: rgba(15,23,42,.55);
    border: 1px solid rgba(34,197,94,.15);
    border-radius: 2mm;
    padding: 3mm;
  }
  .feat .icon { font-size: 14pt; }
  .feat h3 { color: #22c55e; font-size: 10pt; font-weight: 800; margin: 1.5mm 0 1mm; }
  .feat p { color: #94a3b8; font-size: 8.5pt; line-height: 1.35; }

  .bottom {
    position: absolute; bottom: 10mm; left: 14mm; right: 14mm;
    display: flex; justify-content: space-between; align-items: center; gap: 6mm;
  }
  .qr-block {
    display: flex; align-items: center; gap: 4mm;
    background: rgba(10,14,18,.92);
    padding: 3.5mm 4mm; border-radius: 2mm;
    border: 1px solid rgba(34,197,94,.3);
  }
  .qr-block img { width: 22mm; height: 22mm; background: #fff; padding: 1mm; border-radius: 1mm; display: block; }
  .qr-block .qr-caption { font-weight: 700; font-size: 9pt; color: #22c55e; }
  .qr-block .qr-url { font-family: 'Orbitron', monospace; font-size: 7pt; color: #94a3b8; margin-top: 1mm; }

  .bottom-right { text-align: ${DIR === 'rtl' ? 'left' : 'right'}; flex: 1; }
  .motto { font-size: 9pt; color: #64748b; font-style: italic; line-height: 1.4; }
  .audience { font-size: 9pt; color: #22d3ee; margin-top: 2mm; font-weight: 600; }
</style></head>
<body><div class="page">
  <div class="top">
    <div class="brand-mark">${S.brand.toUpperCase()}</div>
    <div class="badge">micro:bit V2</div>
  </div>

  <div class="title">${S.posterTitle}</div>
  <div class="tagline">${S.flyerTagline}</div>
  <div class="subtitle">${S.posterSubtitle}</div>

  <div class="shot-row">
    <div class="shot"><img src="${shot(C.screenshots.teacher)}"></div>
    <div class="shot"><img src="${shot(C.screenshots.kid)}"></div>
    <div class="shot"><img src="${shot(C.screenshots.maker)}"></div>
  </div>

  <div class="steps-block">
    <h2>${S.stepsHeader}</h2>
    <ol class="steps">
      ${S.steps.map(st => `<li>${st}</li>`).join('')}
    </ol>
  </div>

  <div class="features">
    ${S.features.map(f => `
    <div class="feat">
      <span class="icon">${f.icon}</span>
      <h3>${f.h}</h3>
      <p>${f.p}</p>
    </div>`).join('')}
  </div>

  <div class="bottom">
    <div class="qr-block">
      <img src="${qrDataUrl}">
      <div>
        <div class="qr-caption">${S.qrCaption}</div>
        <div class="qr-url">${C.url}</div>
      </div>
    </div>
    <div class="bottom-right">
      <div class="audience">${S.audienceLine}</div>
      <div class="motto">${S.motto}</div>
    </div>
  </div>
</div></body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────
// Render
// ─────────────────────────────────────────────────────────────────────────
const MM_TO_PX = 96 / 25.4; // 3.7795
const pages = [
  { name: 'poster-a3', html: posterHtml(), wMm: 297, hMm: 420, format: 'A3' },
  { name: 'flyer-a4',  html: flyerHtml(),  wMm: 210, hMm: 297, format: 'A4' },
];

console.log(`\n🖨️  Generating print assets · lang=${LANG}\n`);

const browser = await chromium.launch();
try {
  for (const p of pages) {
    const htmlPath = join(OUT, `${p.name}.html`);
    writeFileSync(htmlPath, p.html);

    const ctx = await browser.newContext({
      viewport: { width: Math.round(p.wMm * MM_TO_PX), height: Math.round(p.hMm * MM_TO_PX) },
      deviceScaleFactor: 2.6,  // ~250 DPI
    });
    const page = await ctx.newPage();
    await page.goto(`file://${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    await page.screenshot({ path: join(OUT, `${p.name}.png`), fullPage: false });
    console.log(`  ✓ ${p.name}.png`);

    await page.pdf({ path: join(OUT, `${p.name}.pdf`), format: p.format, printBackground: true });
    console.log(`  ✓ ${p.name}.pdf`);

    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log(`\n✅ ${OUT}\n`);
