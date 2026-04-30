/**
 * Theme-morph loop — 4-theme crossfade as MP4 + GIF.
 *
 * Uses the already-captured screenshot-theme-{stealth,neon,arctic,blaze}.png
 * files (run capture-screenshots.mjs first). Produces a 6-second seamless
 * loop that crossfades through the palette.
 *
 * Output:
 *   output/theme-morph.mp4   — 1080x1920, H.264, ~3 MB
 *   output/theme-morph.gif   — same clip, web-optimised, for Pinterest
 *
 * Requires: ffmpeg on PATH.
 *
 * Usage:
 *   node etsy-package/seller-only/theme-morph.mjs
 */

import { spawnSync } from 'child_process';
import { mkdirSync, existsSync, rmSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const argLangIdx = process.argv.indexOf('--lang');
const LANG = argLangIdx > 0 ? process.argv[argLangIdx + 1] : 'en';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(__dirname, '..');
const SHOTS = resolve(PKG, 'output', LANG, 'screenshots');
const OUT = resolve(PKG, 'output', LANG);
const TMP = resolve(PKG, 'output', '_tmp', `theme-morph-${LANG}`);

const THEMES = ['stealth', 'neon', 'arctic', 'blaze'];
// 1:1 square — Pinterest + Instagram + Etsy thumbnail all prefer square.
// Also eliminates the 9:16 letterboxing (screenshots are landscape 2200x1500).
const W = 1080, H = 1080, FPS = 30;
const HOLD = 1.0;      // seconds each theme is fully visible
const FADE = 0.5;      // seconds of crossfade between themes

function run(args, label) {
  console.log(`  · ${label}`);
  const r = spawnSync('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) {
    console.error(`❌ ffmpeg failed (${label}):\n${r.stderr.toString().split('\n').slice(-15).join('\n')}`);
    process.exit(1);
  }
}

try { spawnSync('ffmpeg', ['-version'], { stdio: 'pipe' }); }
catch { console.error('❌ ffmpeg not on PATH.'); process.exit(1); }

for (const t of THEMES) {
  const p = join(SHOTS, `screenshot-theme-${t}.png`);
  if (!existsSync(p)) { console.error(`❌ missing: ${p}\n   Run capture-screenshots.mjs themes first.`); process.exit(1); }
}

if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });

console.log(`\n🎨 Building theme-morph loop (${(THEMES.length * (HOLD + FADE)).toFixed(1)}s, ${W}x${H})\n`);

// For each theme: a (HOLD + FADE)-second clip scaled-padded to 1080x1920.
// Use scale-to-fit-width + dark-BG pad to avoid cropping, matching
// generate-video.mjs styling.
const BG = '0x0a0e12';
const SEG_DUR = HOLD + FADE;

const sceneFiles = [];
for (let i = 0; i < THEMES.length; i++) {
  const t = THEMES[i];
  const src = join(SHOTS, `screenshot-theme-${t}.png`);
  const out = join(TMP, `scene-${i}.mp4`);
  run([
    '-y',
    '-loop', '1', '-framerate', String(FPS), '-i', src,
    '-vf', [
      // Fill-and-crop: scale so the screenshot fills 1080x1080, then crop
      // centered. Keeps UI palette visible with minimal dead space.
      `scale=${W}:${H}:force_original_aspect_ratio=increase`,
      `crop=${W}:${H}`,
      'format=yuv420p',
    ].join(','),
    '-t', String(SEG_DUR),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-pix_fmt', 'yuv420p',
    out,
  ], `scene ${i} (${t})`);
  sceneFiles.push(out);
}

// Build a filter_complex that crossfades each pair; final clip loops cleanly
// by also crossfading the last scene back into scene 0.
// Pattern: [0][1]xfade=offset=HOLD[x01]; [x01][2]xfade=offset=SEG_DUR+HOLD[x012]; ...
const inputs = [];
for (const f of sceneFiles) inputs.push('-i', f);
inputs.push('-i', sceneFiles[0]); // tail-fade back to first

const n = THEMES.length + 1; // sceneFiles + repeat of first
let filter = '';
let prev = '[0:v]';
for (let i = 1; i < n; i++) {
  const offset = (HOLD + FADE) * i - FADE; // last FADE seconds overlap
  const tag = `[x${i}]`;
  filter += `${prev}[${i}:v]xfade=transition=fade:duration=${FADE}:offset=${offset}${i === n - 1 ? '[vout]' : tag};`;
  prev = tag;
}
filter = filter.replace(/;$/, '');

const totalDur = (HOLD + FADE) * THEMES.length;
const mp4 = join(OUT, 'theme-morph.mp4');
run([
  '-y',
  ...inputs,
  '-filter_complex', filter,
  '-map', '[vout]',
  '-t', String(totalDur),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  mp4,
], 'crossfade encode');

const gif = join(OUT, 'theme-morph.gif');
const palette = join(TMP, 'palette.png');
run([
  '-y', '-i', mp4,
  '-vf', 'fps=15,scale=540:540:flags=lanczos,palettegen=stats_mode=full',
  palette,
], 'gif palette');
run([
  '-y', '-i', mp4, '-i', palette,
  '-filter_complex', 'fps=15,scale=540:540:flags=lanczos[v];[v][1:v]paletteuse=dither=bayer:bayer_scale=5',
  '-loop', '0',
  gif,
], 'gif encode');

console.log(`\n✅ ${mp4}`);
console.log(`✅ ${gif}\n`);
