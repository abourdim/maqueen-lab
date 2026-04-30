/**
 * 5-second demo GIFs for Etsy image slots + Pinterest + social.
 *
 * Reads `capture-config.json` for product-specific DOM. For each configured
 * GIF recipe, Playwright records a short video while scripted interactions
 * animate the UI; ffmpeg then converts to an optimised palette-dithered GIF.
 *
 * Etsy mobile autoplays GIFs in the image grid — a live demo GIF in slot 3
 * is measurably higher CTR than a static screenshot.
 *
 * Requires:
 *   - @playwright/test + chromium installed (same as capture-screenshots.mjs)
 *   - ffmpeg on PATH
 *
 * Usage:
 *   node etsy-package/tools/generate-gifs.mjs [recipeName]
 *   (default = all)
 *
 * Output:
 *   output/gifs/<recipe>.gif     (optimised, <1 MB target)
 *   output/gifs/<recipe>.mp4     (source clip, kept for re-encode)
 */

import { chromium } from '@playwright/test';
import { spawnSync } from 'child_process';
import { mkdirSync, existsSync, readFileSync, readdirSync, rmSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const argLangIdx = process.argv.indexOf('--lang');
const LANG = argLangIdx > 0 ? process.argv[argLangIdx + 1] : 'en';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG  = resolve(__dirname, '..');
const ROOT = resolve(PKG, '..');
const INDEX = resolve(ROOT, 'index.html');
const OUT = resolve(PKG, 'output', LANG, 'gifs');
const CFG = JSON.parse(readFileSync(resolve(__dirname, 'capture-config.json'), 'utf8'));

const ONLY = process.argv.find((a, i) => i >= 2 && !a.startsWith('--') && process.argv[i - 1] !== '--lang');
mkdirSync(OUT, { recursive: true });

const FPS = 15;
const W = 900, H = 900; // 1:1, smaller than capture so GIFs stay lean

// ---------- recipes (product-specific, config-driven) ----------
// Each recipe takes: tabSlug, duration(s), and an "act" function that drives
// the UI. Recipes live here because they encode motion, not static state —
// separating them from capture-config keeps that file declarative.

const RECIPES = {
  'ledmatrix-heart': {
    tabSlug: 'controls',
    duration: 5,
    async act(page) {
      const leds = CFG.pairs?.leds;
      if (!leds) return;
      // Progressive draw: row by row
      for (let r = 0; r < 5; r++) {
        await page.evaluate(({ cfg, row }) => {
          const cells = document.querySelectorAll(cfg.matrixCellSelector);
          cells.forEach(c => {
            const rr = +(c.getAttribute(cfg.rowAttr) ?? -1);
            const cc = +(c.getAttribute(cfg.colAttr) ?? -1);
            if (rr === row && cfg.pattern[rr]?.[cc]) c.classList.add(cfg.onClass || 'on');
          });
        }, { cfg: leds, row: r });
        await page.waitForTimeout(600);
      }
      await page.waitForTimeout(1500); // Hold complete pattern
    },
  },
  'graph-record': {
    tabSlug: 'graph',
    duration: 5,
    async act(page) {
      // Start simulate → record → data builds up
      const sim = page.locator('button:has-text("Simulate"), button:has-text("🎲 Simulate")').first();
      if (await sim.count()) await sim.click();
      await page.waitForTimeout(4500);
    },
  },
  '3d-tilt-sweep': {
    tabSlug: '3d',
    duration: 5,
    async act(page) {
      // Sweep tilt from 0° → 40° → -40° → 0° over 5s.
      const target = 'window.microbitModel || window.boardGroup';
      const start = Date.now();
      while (Date.now() - start < 4800) {
        const t = (Date.now() - start) / 4800;
        const angle = Math.sin(t * Math.PI * 2) * 40;
        await page.evaluate(({ t, a }) => {
          try {
            const m = window.microbitModel || window.boardGroup;
            if (m?.rotation) m.rotation.x = a * Math.PI / 180;
          } catch {}
        }, { t, a: angle });
        await page.waitForTimeout(40);
      }
    },
  },
  'theme-swap': {
    tabSlug: 'controls',
    duration: 5,
    async act(page) {
      const themes = CFG.variants?.themes?.values || ['neon'];
      for (const t of themes) {
        await page.evaluate(({ attr, value, target, storageKey }) => {
          const el = target === 'html' ? document.documentElement : document.querySelector(target);
          if (el) el.setAttribute(attr, value);
          try { if (storageKey) localStorage.setItem(storageKey, value); } catch {}
        }, { attr: CFG.theme?.attr, value: t, target: CFG.theme?.attrTarget || 'html', storageKey: CFG.theme?.storageKey });
        await page.waitForTimeout(1100);
      }
    },
  },
};

function ff(args, label) {
  console.log(`  · ${label}`);
  const r = spawnSync('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) {
    console.error(`❌ ffmpeg failed (${label}):\n${r.stderr.toString().split('\n').slice(-10).join('\n')}`);
    process.exit(1);
  }
}

try { spawnSync('ffmpeg', ['-version'], { stdio: 'pipe' }); }
catch { console.error('❌ ffmpeg not on PATH.'); process.exit(1); }

if (!existsSync(INDEX)) { console.error(`❌ app not found at ${INDEX}`); process.exit(1); }

async function newPageRec(browser, videosDir) {
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    recordVideo: { dir: videosDir, size: { width: W, height: H } },
  });
  const page = await ctx.newPage();
  const langHash = LANG !== 'en' ? `#lang=${LANG}` : '';
  await page.goto(`file://${INDEX.replace(/\\/g, '/')}${langHash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  if (CFG.onboarding?.localStorageKey) {
    await page.evaluate((k) => { try { localStorage.setItem(k, '1'); } catch {} }, CFG.onboarding.localStorageKey);
  }
  if (CFG.theme?.storageKey && CFG.theme?.default) {
    await page.evaluate(({ k, v }) => { try { localStorage.setItem(k, v); } catch {} },
      { k: CFG.theme.storageKey, v: CFG.theme.default });
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  return { ctx, page };
}

async function switchTab(page, slug) {
  const tab = (CFG.tabs || []).find(t => t.slug === slug);
  if (!tab) return;
  if (tab.requiresExpert && CFG.expertMode?.toggleSelector) {
    const exp = page.locator(CFG.expertMode.toggleSelector);
    if (await exp.count()) { try { await exp.click({ timeout: 500 }); } catch {} await page.waitForTimeout(300); }
  }
  await page.locator(tab.selector).click();
  await page.waitForTimeout(tab.settle ?? 500);
}

async function injectSyntheticConnect(page) {
  const c = CFG.synthetic?.connect;
  if (!c) return;
  await page.evaluate((cfg) => {
    try { if (cfg.globalCall) new Function(cfg.globalCall)(); } catch {}
    const pill = cfg.pillSelector ? document.querySelector(cfg.pillSelector) : null;
    if (pill) {
      if (cfg.pillAddClass) pill.classList.add(cfg.pillAddClass);
      if (cfg.pillRemoveClass) pill.classList.remove(cfg.pillRemoveClass);
    }
    try { window.showToast = () => {}; } catch {}
    document.querySelectorAll('.toast, .toast-container > *').forEach(e => e.remove());
    const tc = document.querySelector('.toast-container'); if (tc) tc.style.display = 'none';
  }, c);
}

async function record(browser, name, recipe) {
  const tmp = resolve(OUT, `_rec-${name}`);
  if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const { ctx, page } = await newPageRec(browser, tmp);

  await injectSyntheticConnect(page);
  await switchTab(page, recipe.tabSlug);
  await page.waitForTimeout(500);

  const start = Date.now();
  await recipe.act(page);
  const elapsed = (Date.now() - start) / 1000;
  if (elapsed < recipe.duration) await page.waitForTimeout((recipe.duration - elapsed) * 1000);

  // Close context → finalises video file.
  await page.close();
  await ctx.close();

  // Find the produced .webm
  const webms = readdirSync(tmp).filter(f => f.endsWith('.webm'));
  if (!webms.length) { console.error(`❌ no webm recorded for ${name}`); return; }
  const src = join(tmp, webms[0]);

  const mp4 = resolve(OUT, `${name}.mp4`);
  ff([
    '-y', '-i', src,
    '-t', String(recipe.duration),
    '-vf', `scale=${W}:${H}:flags=lanczos,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '22',
    '-movflags', '+faststart',
    mp4,
  ], `${name}.mp4`);

  const gif = resolve(OUT, `${name}.gif`);
  const palette = resolve(tmp, 'palette.png');
  ff([
    '-y', '-i', mp4,
    '-vf', `fps=${FPS},scale=480:-1:flags=lanczos,palettegen=stats_mode=diff`,
    palette,
  ], `${name}.gif palette`);
  ff([
    '-y', '-i', mp4, '-i', palette,
    '-filter_complex', `fps=${FPS},scale=480:-1:flags=lanczos[v];[v][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
    '-loop', '0',
    gif,
  ], `${name}.gif encode`);

  rmSync(tmp, { recursive: true, force: true });
  console.log(`  ✅ ${name}.mp4 + ${name}.gif`);
}

// ---------- main ----------

const browser = await chromium.launch();
try {
  console.log(`\n🎞️  Recording demo GIFs (${W}x${H} @ ${FPS}fps)\n`);
  for (const [name, recipe] of Object.entries(RECIPES)) {
    if (ONLY && ONLY !== name) continue;
    console.log(`▸ ${name} (${recipe.duration}s)`);
    await record(browser, name, recipe);
  }
} finally {
  await browser.close();
}
console.log(`\n✅ ${OUT}\n`);
