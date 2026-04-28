/**
 * Maqueen Lab — Etsy Package Builder
 * Renders printables to PNG, gathers the app + docs, and builds the ZIP.
 *
 * Usage:
 *   npm install --save-dev @playwright/test
 *   npx playwright install chromium
 *   node etsy-package/build-package.js
 *
 * Produces:
 *   etsy-package/MaqueenLab-v1.2.0/          (folder)
 *   etsy-package/MaqueenLab-v1.2.0.zip       (final ZIP)
 *   etsy-package/output/*.png                   (rendered printables + mockups)
 *
 * Mirrors noor-cast/etsy-package/build-package.js (same structure, adapted paths).
 * Seller-only files in this folder (ETSY_LISTING*, ETSY_PUBLISH_GUIDE,
 * LICENSE-SITE, SITE_LICENSE_CERTIFICATE) are NEVER copied into the ZIP.
 */

import { chromium } from '@playwright/test';
import { execSync } from 'child_process';
import { mkdirSync, existsSync, copyFileSync, readdirSync, readFileSync, rmSync, statSync } from 'fs';
import { resolve, join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const VERSION = 'v1.2.0';
const PRODUCT_SLUG = 'MaqueenLab';

if (!/^v\d+\.\d+\.\d+$/.test(VERSION)) {
  console.error(`❌ VERSION "${VERSION}" must match vMAJOR.MINOR.PATCH (e.g. v1.2.0).`);
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PKG = resolve(__dirname);
const OUT = resolve(PKG, 'output');
const SHARED = resolve(OUT, 'shared');
const MOCKUPS = resolve(SHARED, 'mockups');
const PIN_DIR = resolve(SHARED, 'pinterest-pins');
const PRINT_RENDERS = resolve(SHARED, 'printable-renders');
mkdirSync(SHARED, { recursive: true });
mkdirSync(MOCKUPS, { recursive: true });
mkdirSync(PIN_DIR, { recursive: true });
mkdirSync(PRINT_RENDERS, { recursive: true });
const ZIP_DIR = resolve(PKG, `${PRODUCT_SLUG}-${VERSION}`);
const warnings = [];
const warn = (msg) => { warnings.push(msg); console.log(`  ⚠️  ${msg}`); };

if (existsSync(ZIP_DIR)) rmSync(ZIP_DIR, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
mkdirSync(join(ZIP_DIR, 'printables'), { recursive: true });
mkdirSync(join(ZIP_DIR, 'etsy-mockups'), { recursive: true });
mkdirSync(join(ZIP_DIR, 'assets'), { recursive: true });
mkdirSync(join(ZIP_DIR, 'docs'), { recursive: true });
mkdirSync(join(ZIP_DIR, 'js'), { recursive: true });

async function renderHTML(browser, htmlFile, outputPng, opts = {}) {
  const page = await browser.newPage({
    viewport: { width: opts.width || 794, height: opts.height || 1123 },
    deviceScaleFactor: opts.scale || 2,
  });
  await page.goto(`file://${resolve(PKG, htmlFile)}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  if (opts.fullPage) await page.screenshot({ path: outputPng, fullPage: true });
  else               await page.screenshot({ path: outputPng });
  await page.close();
  console.log(`  ✓ ${outputPng.split('/').pop()}`);
}

async function renderMockups(browser) {
  const page = await browser.newPage({
    viewport: { width: 2000, height: 1500 }, deviceScaleFactor: 1,
  });
  await page.goto(`file://${resolve(PKG, 'etsy-listing-mockups.html')}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const mockups = await page.$$('.mockup');
  for (let i = 0; i < mockups.length; i++) {
    const p = join(MOCKUPS, `etsy-mockup-${i + 1}.png`);
    await mockups[i].screenshot({ path: p });
    console.log(`  ✓ etsy-mockup-${i + 1}.png`);
  }
  await page.close();
}

async function renderShootCard(browser) {
  const src = resolve(PKG, 'seller-only/video-shoot-card.html');
  if (!existsSync(src)) return;
  const page = await browser.newPage({
    viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2,
  });
  await page.goto(`file://${src}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const out = join(SHARED, 'video-shoot-card.png');
  await page.screenshot({ path: out, fullPage: true });
  console.log(`  ✓ video-shoot-card.png`);
  await page.close();
}

async function renderPinterestPins(browser) {
  const src = resolve(PKG, 'seller-only/pinterest-pins.html');
  if (!existsSync(src)) return;
  const page = await browser.newPage({
    viewport: { width: 1000, height: 1500 }, deviceScaleFactor: 2,
  });
  await page.goto(`file://${src}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const pins = await page.$$('.pin');
  for (let i = 0; i < pins.length; i++) {
    const p = join(PIN_DIR, `pinterest-pin-${i + 1}.png`);
    await pins[i].screenshot({ path: p });
    console.log(`  ✓ pinterest-pin-${i + 1}.png`);
  }
  await page.close();
}

function copyDir(name, destName = name) {
  const src = join(ROOT, name);
  if (!existsSync(src)) { warn(`missing: ${name}/`); return; }
  const dst = join(ZIP_DIR, destName);
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dst, entry);
    if (statSync(s).isDirectory()) {
      mkdirSync(d, { recursive: true });
      for (const sub of readdirSync(s)) copyFileSync(join(s, sub), join(d, sub));
    } else {
      copyFileSync(s, d);
    }
  }
  console.log(`  ✓ ${destName}/`);
}

async function main() {
  console.log(`\n🎮 Maqueen Lab Etsy Package Builder — ${VERSION}\n`);
  console.log('📦 Rendering printables to PNG...\n');

  const browser = await chromium.launch();

  await renderHTML(browser, 'quickstart-card.html',     join(PRINT_RENDERS, 'quickstart-card.png'));
  await renderHTML(browser, 'shortcuts-cheatsheet.html',join(PRINT_RENDERS, 'shortcuts-cheatsheet.png'), { width: 1123, height: 794 });
  await renderHTML(browser, 'classroom-poster.html',    join(PRINT_RENDERS, 'classroom-poster.png'),    { width: 1123, height: 1587 });
  await renderHTML(browser, 'lesson-plan-template.html',join(PRINT_RENDERS, 'lesson-plan-template.png'), { fullPage: true });
  await renderHTML(browser, 'sticker-sheet.html',       join(PRINT_RENDERS, 'sticker-sheet.png'));
  await renderHTML(browser, 'README-quickstart.html',   join(PRINT_RENDERS, 'README-quickstart.png'));

  console.log('\n🖼️  Rendering Etsy listing mockups...\n');
  await renderMockups(browser);

  console.log('\n📌 Rendering Pinterest pins (seller-only)...\n');
  await renderPinterestPins(browser);

  console.log('\n🎬 Rendering video shoot card (seller-only)...\n');
  await renderShootCard(browser);

  await browser.close();

  console.log('\n📁 Building ZIP structure...\n');

  const appFiles = [
    'index.html', 'styles.css', 'sw.js', 'manifest.json',
    'makecode.ts', 'pxt.json', 'tests.html',
    'README.md', 'SETUP.md', 'CHANGELOG.md', 'LICENSE',
  ];
  for (const f of appFiles) {
    const src = join(ROOT, f);
    if (existsSync(src)) { copyFileSync(src, join(ZIP_DIR, f)); console.log(`  ✓ ${f}`); }
    else warn(`missing app file: ${f}`);
  }

  copyDir('docs');
  copyDir('assets');
  copyDir('js');

  copyFileSync(join(PKG, 'LICENSE.txt'), join(ZIP_DIR, 'LICENSE.txt'));
  console.log('  ✓ LICENSE.txt');

  const printables = [
    'quickstart-card.png', 'shortcuts-cheatsheet.png',
    'classroom-poster.png', 'lesson-plan-template.png',
    'sticker-sheet.png', 'README-quickstart.png',
  ];
  let printablesPngCount = 0;
  for (const f of printables) {
    const src = join(PRINT_RENDERS, f);
    if (existsSync(src)) { copyFileSync(src, join(ZIP_DIR, 'printables', f)); printablesPngCount++; }
    else warn(`missing printable PNG: ${f}`);
  }
  console.log(`  ✓ printables/ PNGs (${printablesPngCount}/${printables.length})`);

  const htmlSources = [
    'quickstart-card.html', 'shortcuts-cheatsheet.html',
    'classroom-poster.html', 'lesson-plan-template.html',
    'sticker-sheet.html', 'README-quickstart.html',
  ];
  let htmlSourceCount = 0;
  for (const f of htmlSources) {
    const src = join(PKG, f);
    if (existsSync(src)) { copyFileSync(src, join(ZIP_DIR, 'printables', f)); htmlSourceCount++; }
    else warn(`missing printable HTML source: ${f}`);
  }
  console.log(`  ✓ printables/ HTML sources (${htmlSourceCount}/${htmlSources.length})`);

  // Copy theme-morph.gif alongside printables so README-quickstart.html's
  // <img src="theme-morph.gif"> loops the live-preview animation when buyers
  // open the HTML in a browser. Skipped silently if not yet generated.
  const themeGif = join(OUT, 'en', 'theme-morph.gif');
  if (existsSync(themeGif)) {
    copyFileSync(themeGif, join(ZIP_DIR, 'printables', 'theme-morph.gif'));
    console.log('  ✓ printables/theme-morph.gif (auto-play demo)');
  } else {
    warn('printables/theme-morph.gif missing — run tools/theme-morph.mjs first');
  }

  let mockupCount = 0;
  for (let i = 1; i <= 7; i++) {
    const f = `etsy-mockup-${i}.png`;
    const src = join(MOCKUPS, f);
    if (existsSync(src)) { copyFileSync(src, join(ZIP_DIR, 'etsy-mockups', f)); mockupCount++; }
  }
  if (mockupCount === 0) warn('no etsy-mockups rendered');
  console.log(`  ✓ etsy-mockups/ (${mockupCount})`);

  console.log('\n🔎 Scanning ZIP contents for unsubstituted placeholders...\n');
  const textExts = new Set(['.html', '.md', '.txt', '.css', '.js', '.json', '.ts', '.svg', '.xml']);
  const placeholderRe = /\{\{[A-Z_]+\}\}/g;
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const st = statSync(p);
      if (st.isDirectory()) { walk(p); continue; }
      const ext = entry.slice(entry.lastIndexOf('.')).toLowerCase();
      if (!textExts.has(ext)) continue;
      const text = readFileSync(p, 'utf8');
      const hits = text.match(placeholderRe);
      if (hits) warn(`placeholder residue in ${relative(ZIP_DIR, p)}: ${[...new Set(hits)].join(', ')}`);
    }
  };
  const beforeScan = warnings.length;
  walk(ZIP_DIR);
  if (warnings.length === beforeScan) console.log('  ✓ no placeholder residue');

  console.log('\n📦 Creating ZIP archive...\n');
  const zipPath = join(PKG, `${PRODUCT_SLUG}-${VERSION}.zip`);
  if (existsSync(zipPath)) rmSync(zipPath);
  let zipped = false;
  try { execSync(`cd "${PKG}" && zip -r "${zipPath}" "${PRODUCT_SLUG}-${VERSION}/"`, { stdio: 'pipe' }); zipped = true; } catch {}
  if (!zipped) try { execSync(`cd "${PKG}" && ditto -c -k --keepParent "${PRODUCT_SLUG}-${VERSION}" "${zipPath}"`, { stdio: 'pipe' }); zipped = true; } catch {}
  if (!zipped) try { execSync(`powershell.exe -Command "Compress-Archive -Path '${ZIP_DIR}' -DestinationPath '${zipPath}' -Force"`, { stdio: 'pipe' }); zipped = true; } catch {}

  if (zipped) console.log(`  ✅ ${zipPath}`);
  else        warn(`could not create ZIP — manually zip ${ZIP_DIR}`);

  try {
    const size = execSync(`du -sh "${zipPath}" 2>/dev/null || echo "N/A"`).toString().trim();
    console.log(`\n📊 ZIP size: ${size.split('\t')[0]}`);
  } catch {}

  console.log(warnings.length ? `\n⚠️  Completed with ${warnings.length} warning(s).\n` : '\n🎉 Done!\n');
  console.log('Files:');
  console.log(`  📦 ZIP:      ${zipPath}`);
  console.log(`  📁 Folder:   ${ZIP_DIR}/`);
  console.log(`  🖼️  Mockups:  ${join(MOCKUPS, 'etsy-mockup-*.png')}`);
  console.log(`  🖨️  Prints:   ${join(PRINT_RENDERS, '*.png')}\n`);
  if (warnings.length) process.exitCode = 1;
}

main().catch((err) => { console.error(err); process.exit(1); });
