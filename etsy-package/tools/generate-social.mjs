/**
 * Generate social-media kit PNGs per language.
 *
 * 4 formats × 3 langs = 12 files per run (if --lang all, else 4).
 *   - ig-post   1080 × 1080  (Instagram feed, Facebook square)
 *   - ig-story  1080 × 1920  (Instagram / WhatsApp / Facebook story, Reels)
 *   - twitter   1200 × 675   (Twitter / X post card)
 *   - linkedin  1200 × 627   (LinkedIn share image)
 *
 * Usage:
 *   node etsy-package/tools/generate-social.mjs --lang en
 *   node etsy-package/tools/generate-social.mjs --lang ar
 *
 * Output: etsy-package/output/<lang>/social/<format>.png
 */

import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(__dirname, '..');

const argLangIdx = process.argv.indexOf('--lang');
const LANG = argLangIdx > 0 ? process.argv[argLangIdx + 1] : 'en';

const SPECS = JSON.parse(readFileSync(join(__dirname, 'social-specs.json'), 'utf8'));
const S = SPECS[LANG];
if (!S) { console.error(`❌ No social-specs entry for lang=${LANG}`); process.exit(1); }

const SHOTS = resolve(PKG, 'output', LANG, 'screenshots');
const OUT = resolve(PKG, 'output', LANG, 'social');
mkdirSync(OUT, { recursive: true });

const DIR = LANG === 'ar' ? 'rtl' : 'ltr';
const FONT = LANG === 'ar' ? `'Tajawal', 'Inter', sans-serif` : `'Inter', system-ui, sans-serif`;

function shot() {
  const p = join(SHOTS, SPECS.screenshot);
  if (existsSync(p)) return 'file://' + p.replace(/\\/g, '/');
  return 'file://' + join(PKG, 'output', 'en', 'screenshots', SPECS.screenshot).replace(/\\/g, '/');
}

function html(fmt) {
  const isSquare = fmt.layout === 'square';
  const isPortrait = fmt.layout === 'portrait';
  const isLandscape = fmt.layout === 'landscape';

  // Title font size scales with canvas.
  const titlePx = isPortrait ? 92 : isSquare ? 76 : 58;
  const subPx = isPortrait ? 32 : isSquare ? 28 : 22;
  const kickerPx = isPortrait ? 20 : 16;

  const shotW = isPortrait ? '88%' : isSquare ? '88%' : '52%';
  const shotPos = isLandscape
    ? `position: absolute; top: 50%; ${DIR === 'rtl' ? 'left' : 'right'}: 40px; transform: translateY(-50%); width: ${shotW}; max-height: 85%;`
    : `margin: ${isPortrait ? '50px' : '30px'} auto 0; width: ${shotW};`;

  const textBlockPos = isLandscape
    ? `position: absolute; top: 50%; ${DIR === 'rtl' ? 'right' : 'left'}: 50px; transform: translateY(-50%); max-width: 45%;`
    : `position: relative; padding: 50px 60px 0; text-align: ${DIR === 'rtl' ? 'right' : 'left'};`;

  return `<!DOCTYPE html>
<html lang="${LANG}" dir="${DIR}"><head><meta charset="UTF-8"><style>
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=Inter:wght@400;600;800;900&family=Tajawal:wght@400;700;900&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${fmt.w}px; height: ${fmt.h}px; overflow: hidden; }
  body {
    font-family: ${FONT};
    background: radial-gradient(circle at 20% 20%, #062b1a 0%, #020617 60%);
    color: #e8ffe8;
    position: relative;
  }
  .grid {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(34,197,94,.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(34,197,94,.05) 1px, transparent 1px);
    background-size: 60px 60px;
  }
  .glow1 { position: absolute; inset: 0; background: radial-gradient(circle at 85% 10%, rgba(34,211,238,.18) 0%, transparent 45%); }
  .glow2 { position: absolute; inset: 0; background: radial-gradient(circle at 10% 90%, rgba(34,197,94,.15) 0%, transparent 50%); }

  .text-block { ${textBlockPos} z-index: 3; }
  .kicker {
    font-family: 'Orbitron', monospace;
    font-size: ${kickerPx}px;
    color: #22d3ee; letter-spacing: 0.22em;
    margin-bottom: 16px;
    ${LANG === 'ar' ? `font-family: ${FONT};` : ''}
  }
  .title {
    font-family: ${LANG === 'ar' ? `'Tajawal', sans-serif` : `'Orbitron', 'Inter', sans-serif`};
    font-size: ${titlePx}px;
    font-weight: ${LANG === 'ar' ? '900' : '700'};
    line-height: 1.05;
    letter-spacing: ${LANG === 'ar' ? 'normal' : '-0.02em'};
    color: #22c55e;
    text-shadow: 0 0 40px rgba(34,197,94,.35);
    white-space: pre-line;
  }
  .subtitle {
    font-size: ${subPx}px;
    font-weight: 600;
    color: #cbd5e1;
    margin-top: 20px;
    line-height: 1.35;
  }
  .cta-row {
    display: flex; align-items: center; gap: 16px;
    margin-top: ${isPortrait ? 40 : 24}px;
    flex-wrap: wrap;
  }
  .cta {
    background: #22c55e; color: #020617;
    padding: ${isPortrait ? '18px 36px' : '12px 24px'};
    border-radius: 999px;
    font-weight: 800;
    font-size: ${isPortrait ? 26 : 18}px;
    box-shadow: 0 8px 24px rgba(34,197,94,.45);
  }
  .url {
    font-family: 'Orbitron', monospace;
    font-size: ${isPortrait ? 18 : 13}px;
    color: #94a3b8;
    letter-spacing: 0.05em;
  }

  .shot-wrap { ${shotPos} z-index: 2; }
  .shot-wrap img {
    width: 100%;
    border-radius: 12px;
    box-shadow: 0 18px 50px rgba(0,0,0,.6), 0 0 0 1.5px rgba(34,197,94,.3);
    display: block;
    transform: perspective(1800px) rotateY(${DIR === 'rtl' ? '5deg' : '-5deg'}) ${isLandscape ? '' : 'translateY(0)'};
  }

  .bottom-strip {
    position: absolute; bottom: 0; left: 0; right: 0;
    padding: ${isPortrait ? '24px 60px' : '16px 40px'};
    display: flex; justify-content: space-between; align-items: center;
    background: linear-gradient(to top, rgba(2,6,23,.95), rgba(2,6,23,0));
    z-index: 4;
  }
  .brand-mark {
    font-family: 'Orbitron', monospace;
    font-size: ${isPortrait ? 16 : 12}px;
    color: #22c55e;
    letter-spacing: 0.18em;
  }
  .hashtags {
    font-size: ${isPortrait ? 16 : 12}px;
    color: #64748b;
    font-weight: 600;
  }
</style></head>
<body>
  <div class="grid"></div>
  <div class="glow1"></div>
  <div class="glow2"></div>

  <div class="text-block">
    <div class="kicker">${S.kicker}</div>
    <div class="title">${S.title}</div>
    <div class="subtitle">${S.subtitle}</div>
    <div class="cta-row">
      <div class="cta">${S.cta}</div>
      <div class="url">${S.url}</div>
    </div>
  </div>

  <div class="shot-wrap"><img src="${shot()}"></div>

  <div class="bottom-strip">
    <div class="brand-mark">${S.brand.toUpperCase()}</div>
    <div class="hashtags">${S.hashtags}</div>
  </div>
</body></html>`;
}

console.log(`\n📱 Generating social kit · lang=${LANG}\n`);

const browser = await chromium.launch();
try {
  for (const fmt of SPECS.formats) {
    const ctx = await browser.newContext({
      viewport: { width: fmt.w, height: fmt.h },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    const htmlPath = join(OUT, `${fmt.name}.html`);
    writeFileSync(htmlPath, html(fmt));
    await page.goto(`file://${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT, `${fmt.name}.png`) });
    console.log(`  ✓ ${fmt.name}.png (${fmt.w}×${fmt.h}) — ${fmt.label}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log(`\n✅ ${OUT}\n`);
