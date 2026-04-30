/**
 * Generate business card (85×55mm print-ready) + email signature
 * (600×160 PNG for Gmail/Outlook) per language.
 *
 * Usage:
 *   node etsy-package/tools/generate-identity.mjs --lang en
 *
 * Output:
 *   etsy-package/output/<lang>/identity/business-card.{png,pdf,html}
 *   etsy-package/output/<lang>/identity/email-signature.png
 */

import { chromium } from '@playwright/test';
import QRCode from 'qrcode';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(__dirname, '..');

const argLangIdx = process.argv.indexOf('--lang');
const LANG = argLangIdx > 0 ? process.argv[argLangIdx + 1] : 'en';

// Reuse print-specs common section + lang-specific brand/url.
const PRINT = JSON.parse(readFileSync(join(__dirname, 'print-specs.json'), 'utf8'));
const S = PRINT[LANG];
if (!S) { console.error(`❌ No print-specs entry for lang=${LANG}`); process.exit(1); }

const I18N = {
  en: { tagline: 'Every sensor. Live in the browser.', role: 'micro:bit playground · author', contactLabel: 'Say hi' },
  fr: { tagline: 'Chaque capteur, en direct dans le navigateur.', role: 'auteur · micro:bit playground', contactLabel: 'Contact' },
  ar: { tagline: 'كل حساس، مباشرةً في المتصفح.', role: 'مؤلف · micro:bit playground', contactLabel: 'للتواصل' },
};
const T = I18N[LANG];

const OUT = resolve(PKG, 'output', LANG, 'identity');
mkdirSync(OUT, { recursive: true });

const DIR = LANG === 'ar' ? 'rtl' : 'ltr';
const FONT = LANG === 'ar' ? `'Tajawal', 'Inter', sans-serif` : `'Inter', system-ui, sans-serif`;

const qr = await QRCode.toDataURL(PRINT.common.qrUrl, { margin: 1, width: 400, color: { dark: '#020617', light: '#ffffff' } });

// ─────────────────────────────────────────────────────────────────────────
// BUSINESS CARD (standard EU 85×55mm)
// ─────────────────────────────────────────────────────────────────────────
const CARD_FRONT = `<!DOCTYPE html>
<html lang="${LANG}" dir="${DIR}"><head><meta charset="UTF-8"><style>
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=Inter:wght@400;600;800;900&family=Tajawal:wght@400;700;900&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: 85mm 55mm; margin: 0; }
  html, body { width: 85mm; height: 55mm; overflow: hidden; }
  body {
    font-family: ${FONT};
    background: #020617;
    color: #e8ffe8;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
    position: relative;
  }
  .card { width: 85mm; height: 55mm; padding: 5mm 6mm; position: relative; overflow: hidden; }
  .card::before {
    content: ''; position: absolute; inset: 0;
    background: radial-gradient(circle at 90% 10%, rgba(34,197,94,.22) 0%, transparent 55%);
  }
  .brand {
    font-family: 'Orbitron', monospace; font-size: 14pt; font-weight: 700;
    color: #22c55e; letter-spacing: 0.1em;
    position: relative;
  }
  .role {
    font-size: 7.5pt; color: #22d3ee; font-weight: 600;
    margin-top: 1mm; letter-spacing: 0.02em;
  }
  .tagline {
    font-size: 8pt; color: #cbd5e1; font-weight: 500;
    margin-top: 3mm; line-height: 1.35;
    max-width: 55mm;
  }
  .url-row {
    position: absolute; bottom: 5mm; left: 6mm; right: 6mm;
    display: flex; justify-content: space-between; align-items: flex-end;
  }
  .url {
    font-family: 'Orbitron', monospace; font-size: 7pt;
    color: #22c55e; letter-spacing: 0.05em;
  }
  .qr { width: 13mm; height: 13mm; background: #fff; padding: 0.5mm; border-radius: 1mm; }
  .qr img { width: 100%; height: 100%; display: block; }
</style></head>
<body><div class="card">
  <div class="brand">${S.brand}</div>
  <div class="role">${T.role}</div>
  <div class="tagline">${T.tagline}</div>
  <div class="url-row">
    <div class="url">${PRINT.common.url}</div>
    <div class="qr"><img src="${qr}"></div>
  </div>
</div></body></html>`;

// ─────────────────────────────────────────────────────────────────────────
// EMAIL SIGNATURE (600×160 PNG, safe size for Gmail/Outlook)
// ─────────────────────────────────────────────────────────────────────────
const SIG_WIDTH = 600, SIG_HEIGHT = 160;
const SIG = `<!DOCTYPE html>
<html lang="${LANG}" dir="${DIR}"><head><meta charset="UTF-8"><style>
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=Inter:wght@400;600;800&family=Tajawal:wght@400;700;900&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${SIG_WIDTH}px; height: ${SIG_HEIGHT}px; overflow: hidden; }
  body {
    font-family: ${FONT};
    background: #020617;
    color: #e8ffe8;
    display: flex; align-items: center; gap: 20px;
    padding: 18px 24px;
    position: relative;
  }
  body::before {
    content: ''; position: absolute; inset: 0;
    background: radial-gradient(circle at ${DIR === 'rtl' ? '10%' : '90%'} 30%, rgba(34,197,94,.18) 0%, transparent 60%);
  }
  .qr { width: 110px; height: 110px; background: #fff; padding: 4px; border-radius: 6px; z-index: 2; flex-shrink: 0; }
  .qr img { width: 100%; height: 100%; display: block; }
  .info { z-index: 2; flex: 1; }
  .brand {
    font-family: 'Orbitron', monospace;
    font-size: 22px; font-weight: 700; color: #22c55e; letter-spacing: 0.08em;
  }
  .role { font-size: 12px; color: #22d3ee; font-weight: 600; margin-top: 3px; letter-spacing: 0.04em; }
  .tagline { font-size: 13px; color: #cbd5e1; margin-top: 6px; line-height: 1.35; font-weight: 500; }
  .url { font-family: 'Orbitron', monospace; font-size: 11px; color: #94a3b8; letter-spacing: 0.05em; margin-top: 8px; }
</style></head>
<body>
  <div class="qr"><img src="${qr}"></div>
  <div class="info">
    <div class="brand">${S.brand}</div>
    <div class="role">${T.role}</div>
    <div class="tagline">${T.tagline}</div>
    <div class="url">${PRINT.common.url}</div>
  </div>
</body></html>`;

console.log(`\n🪪  Generating identity assets · lang=${LANG}\n`);

const MM_TO_PX = 96 / 25.4;
const browser = await chromium.launch();
try {
  // Business card
  {
    const ctx = await browser.newContext({
      viewport: { width: Math.round(85 * MM_TO_PX), height: Math.round(55 * MM_TO_PX) },
      deviceScaleFactor: 4, // ~380 DPI, ample for print
    });
    const page = await ctx.newPage();
    const htmlPath = join(OUT, 'business-card.html');
    writeFileSync(htmlPath, CARD_FRONT);
    await page.goto(`file://${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT, 'business-card.png') });
    await page.pdf({ path: join(OUT, 'business-card.pdf'), width: '85mm', height: '55mm', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    await ctx.close();
    console.log('  ✓ business-card.png + .pdf (85×55mm)');
  }

  // Email signature
  {
    const ctx = await browser.newContext({
      viewport: { width: SIG_WIDTH, height: SIG_HEIGHT },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    const htmlPath = join(OUT, 'email-signature.html');
    writeFileSync(htmlPath, SIG);
    await page.goto(`file://${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT, 'email-signature.png') });
    await ctx.close();
    console.log(`  ✓ email-signature.png (${SIG_WIDTH}×${SIG_HEIGHT})`);
  }
} finally {
  await browser.close();
}

console.log(`\n✅ ${OUT}\n`);
