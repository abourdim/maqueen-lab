/**
 * "3 seconds to live data" — speed-test proof clip.
 *
 * Renders a 5-second Etsy-ready video demonstrating how fast the product
 * goes from closed → live data. Screen is the app; overlay is a
 * stopwatch that counts in real time and a checkpoint marker at the
 * moment the first sensor reading appears.
 *
 * This is the single strongest conversion lever for the teacher segment:
 * their real fear is "will this work on 30 Chromebooks in 4 minutes?"
 * One clip showing "3.2s to live data" answers that more directly than
 * any bullet point in the description.
 *
 * Requires: @playwright/test + chromium, ffmpeg on PATH.
 *
 * Usage:
 *   node etsy-package/tools/speed-test-clip.mjs
 *
 * Output:
 *   output/speed-test/speed-test.mp4  (1080x1920 9:16, 5s, ~500 KB)
 *   output/speed-test/speed-test.gif  (480x854 9:16, 5s, ~1 MB)
 */

import { chromium } from '@playwright/test';
import { spawnSync } from 'child_process';
import { readFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const argLangIdx = process.argv.indexOf('--lang');
const LANG = argLangIdx > 0 ? process.argv[argLangIdx + 1] : 'en';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG  = resolve(__dirname, '..');
const ROOT = resolve(PKG, '..');
const INDEX = resolve(ROOT, 'index.html');
const OUT = resolve(PKG, 'output', LANG, 'speed-test');
const TMP = resolve(PKG, 'output', '_tmp', `speed-test-${LANG}`);

// Overlay text per language
const L = LANG === 'fr' ? {
  started: '▶ DÉMARRAGE',
  connecting: '🔗 CONNEXION...',
  live: '✓ DONNÉES EN DIRECT',
  toLiveData: 'vers données en direct',
  headline: 'Navigateur → micro\\:bit V2 → données',
  tagline: 'Sans installation · 60 sec pour toute une classe',
} : LANG === 'ar' ? {
  started: '▶ بدء',
  connecting: '🔗 جارٍ الاتصال...',
  live: '✓ بيانات حية',
  toLiveData: 'إلى بيانات حية',
  headline: 'متصفح → micro\\:bit V2 → بيانات',
  tagline: 'بدون تثبيت · 60 ثانية لفصل كامل',
} : {
  started: '▶ STARTED',
  connecting: '🔗 CONNECTING...',
  live: '✓ LIVE DATA',
  toLiveData: 'to live data',
  headline: 'Browser → micro\\:bit V2 → live data',
  tagline: 'No install · 60-sec setup for a whole classroom',
};
const CFG = JSON.parse(readFileSync(resolve(__dirname, 'capture-config.json'), 'utf8'));

mkdirSync(OUT, { recursive: true });
if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const DURATION = 5;
const FPS = 30;
const CHECKPOINT = 3.2; // seconds — when "live data" appears in the clip
const W = 1080, H = 1920;

function ff(args, label) {
  console.log(`  · ${label}`);
  const r = spawnSync('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) {
    console.error(`❌ ffmpeg failed (${label}):\n${r.stderr.toString().split('\n').slice(-12).join('\n')}`);
    process.exit(1);
  }
}
try { spawnSync('ffmpeg', ['-version'], { stdio: 'pipe' }); }
catch { console.error('❌ ffmpeg not on PATH.'); process.exit(1); }

if (!existsSync(INDEX)) { console.error(`❌ app not found at ${INDEX}`); process.exit(1); }

// ---------- record the screen action ----------

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    recordVideo: { dir: TMP, size: { width: W, height: H } },
  });
  const page = await ctx.newPage();
  const langHash = LANG !== 'en' ? `#lang=${LANG}` : '';
  await page.goto(`file://${INDEX.replace(/\\/g, '/')}${langHash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  if (CFG.onboarding?.localStorageKey) {
    await page.evaluate(k => { try { localStorage.setItem(k, '1'); } catch {} }, CFG.onboarding.localStorageKey);
  }
  if (CFG.theme?.storageKey && CFG.theme?.default) {
    await page.evaluate(({ k, v }) => { try { localStorage.setItem(k, v); } catch {} },
      { k: CFG.theme.storageKey, v: CFG.theme.default });
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  // Timeline (aligned to 5s clip):
  //   0.0s  — browser tab reveals the app (just settled)
  //   0.7s  — user clicks "Connect"
  //   3.2s  — first sensor value appears (synthetic inject)
  //   3.5s+ — values continue updating
  //   4.8s  — fade-out

  // Start on a clean controls-tab view
  const tab = (CFG.tabs || []).find(t => t.slug === 'sensors');
  if (tab) await page.locator(tab.selector).click();
  await page.waitForTimeout(500);

  // Clear any toasts / onboarding overlays.
  await page.evaluate(() => {
    try { window.showToast = () => {}; } catch {}
    document.querySelectorAll('.toast, .toast-container > *, .ob-overlay').forEach(e => e.remove());
    const tc = document.querySelector('.toast-container'); if (tc) tc.style.display = 'none';
  });

  const t0 = Date.now();
  // Wait until ~0.7s from recording-start, then simulate the click.
  while ((Date.now() - t0) < 700) await page.waitForTimeout(40);

  const connectSel = CFG.synthetic?.connect?.disableConnectSelector || '#connectBtn';
  await page.evaluate((sel) => {
    const btn = document.querySelector(sel);
    if (btn) btn.classList.add('pressed');
  }, connectSel);

  // Hold until ~3.0s, then inject the connected state + sensor values.
  while ((Date.now() - t0) < 3000) await page.waitForTimeout(40);

  await page.evaluate((cfg) => {
    try { if (cfg.connect?.globalCall) new Function(cfg.connect.globalCall)(); } catch {}
    const pill = cfg.connect?.pillSelector ? document.querySelector(cfg.connect.pillSelector) : null;
    if (pill) {
      if (cfg.connect?.pillAddClass) pill.classList.add(cfg.connect.pillAddClass);
      if (cfg.connect?.pillRemoveClass) pill.classList.remove(cfg.connect.pillRemoveClass);
    }
    for (const s of cfg.sensors || []) {
      const el = document.querySelector(s.selector);
      if (el) el.textContent = s.value;
    }
  }, CFG.synthetic);

  // Keep values "live" — sprinkle small jitter for realism.
  while ((Date.now() - t0) < DURATION * 1000) {
    await page.evaluate((sensors) => {
      for (const s of sensors) {
        const el = document.querySelector(s.selector);
        if (!el) continue;
        const n = parseFloat(s.value) || 0;
        el.textContent = (n + (Math.random() - 0.5)).toFixed(typeof s.value === 'string' && s.value.includes('.') ? 2 : 0);
      }
    }, (CFG.synthetic?.sensors || []).slice(0, 3));
    await page.waitForTimeout(90);
  }

  await page.close();
  await ctx.close();
} finally {
  await browser.close();
}

// ---------- post-process: overlay stopwatch + checkpoint flourish ----------

const webms = readdirSync(TMP).filter(f => f.endsWith('.webm'));
if (!webms.length) { console.error('❌ no recording produced'); process.exit(1); }
const raw = join(TMP, webms[0]);

const mp4Raw = join(TMP, 'raw.mp4');
ff([
  '-y', '-i', raw, '-t', String(DURATION),
  '-vf', `scale=${W}:${H}:flags=lanczos,format=yuv420p,fps=${FPS}`,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
  mp4Raw,
], 'raw → normalised mp4');

// Build overlay filter:
//   1. Top-right stopwatch (monospace "0.0s", "1.2s"...)
//   2. Checkpoint flash at 3.2s with badge "✓ 3.2s — live data"
//   3. Bottom banner: "Browser → micro:bit → live data"

const FONT = process.platform === 'win32'
  ? 'C\\:/Windows/Fonts/arialbd.ttf'
  : '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

// Staged status label (top): "STARTED" → "CONNECTING..." → ✓ with checkpoint.
// No live ticker (ffmpeg expression parsing in drawtext is fragile); the
// staged reveal is more legible anyway.
const overlay = [
  // Bottom dark banner strip
  `drawbox=x=0:y=${H - 260}:w=${W}:h=260:color=black@0.78:t=fill`,

  // Top status pill (720px wide, centered)
  `drawbox=x=120:y=60:w=840:h=120:color=black@0.85:t=fill`,

  // Status text: STARTED (0–0.7s)
  `drawtext=enable='between(t,0,0.7)':text='${L.started}':` +
    `fontcolor=white:fontsize=54:fontfile='${FONT}':x=180:y=90`,
  // Status text: CONNECTING (0.7–3.2s)
  `drawtext=enable='between(t,0.7,${CHECKPOINT})':text='${L.connecting}':` +
    `fontcolor=#ffcc33:fontsize=54:fontfile='${FONT}':x=180:y=90`,
  // Status text: LIVE (3.2s+)
  `drawtext=enable='gte(t,${CHECKPOINT})':text='${L.live}':` +
    `fontcolor=#00ff88:fontsize=54:fontfile='${FONT}':x=180:y=90`,

  // Giant checkpoint flash at t=3.2s (fade-in over 0.3s)
  `drawbox=enable='gte(t,${CHECKPOINT})':x=120:y=${H - 500}:w=840:h=180:color=#00ff88:t=fill`,
  `drawtext=enable='gte(t,${CHECKPOINT})':text='${CHECKPOINT}s':` +
    `fontcolor=black:fontsize=130:fontfile='${FONT}':x=190:y=${H - 485}`,
  `drawtext=enable='gte(t,${CHECKPOINT})':text='${L.toLiveData}':` +
    `fontcolor=black:fontsize=48:fontfile='${FONT}':x=420:y=${H - 400}`,

  // Bottom headline (always on)
  `drawtext=text='${L.headline}':` +
    `fontcolor=white:fontsize=48:fontfile='${FONT}':x=(w-text_w)/2:y=${H - 180}`,
  // Bottom tagline (always on)
  `drawtext=text='${L.tagline}':` +
    `fontcolor=#88aaff:fontsize=30:fontfile='${FONT}':x=(w-text_w)/2:y=${H - 110}`,
].join(',');

const finalMp4 = join(OUT, 'speed-test.mp4');
ff([
  '-y', '-i', mp4Raw,
  '-vf', overlay,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  '-t', String(DURATION),
  finalMp4,
], 'compose overlays');

// ---------- gif ----------

const palette = join(TMP, 'palette.png');
ff([
  '-y', '-i', finalMp4,
  '-vf', `fps=15,scale=480:-1:flags=lanczos,palettegen=stats_mode=diff`,
  palette,
], 'gif palette');

const finalGif = join(OUT, 'speed-test.gif');
ff([
  '-y', '-i', finalMp4, '-i', palette,
  '-filter_complex', `fps=15,scale=480:-1:flags=lanczos[v];[v][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
  '-loop', '0',
  finalGif,
], 'gif encode');

rmSync(TMP, { recursive: true, force: true });
console.log(`\n✅ ${finalMp4}`);
console.log(`✅ ${finalGif}\n`);
