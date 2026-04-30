/**
 * ⚠️  REWRITE PER PRODUCT — SCENES array has bit-playground filenames + text.
 * After apply-template.mjs substitutes Maqueen Lab / Every component, live in your browser, verify
 * screenshots align with what your capture-config.json produces.
 *
 * Etsy 60-second listing video generator — screen-only v1
 *
 * Builds a 1080x1920 (9:16 portrait) MP4 from the app screenshots, logo,
 * and the EN captions SRT. 8 scenes, Ken Burns zoom/pan on each, burned-in
 * subtitles at the bottom, fade transitions between scenes.
 *
 * NOT a replacement for a real-hardware shoot — this is a v1 that gets
 * the listing live with Etsy's video-preferred algorithm boost. Replace
 * with a real micro:bit + laptop shoot once filmed.
 *
 * Requires:
 *   - ffmpeg on PATH (ffmpeg -version must work)
 *   - Node 18+ (ES modules)
 *   - Assets already in place: seller-only/screenshots/, assets/logo.svg,
 *     video-captions-en.srt
 *
 * Usage:
 *   node seller-only/generate-video.mjs
 *
 * Output:
 *   output/etsy-video-v1.mp4           (final)
 *   output/video-scenes/scene-*.mp4    (intermediates, safe to delete)
 */

import { execSync, spawnSync } from 'child_process';
import { mkdirSync, existsSync, writeFileSync, rmSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

// --lang <code> selects a different caption file and changes the output
// filename suffix. Default is "en" (and the output filename has no suffix
// to preserve the canonical silent-EN MP4 that narrate-video expects).
const argLangIdx = process.argv.indexOf('--lang');
const LANG = argLangIdx > 0 ? process.argv[argLangIdx + 1] : 'en';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG  = resolve(__dirname, '..');
const ROOT = resolve(PKG, '..');
const OUT  = resolve(PKG, 'output', LANG);
const SCENES_DIR = resolve(PKG, 'output', '_tmp', `video-scenes-${LANG}`);
const SHOTS = resolve(PKG, 'output', LANG, 'screenshots');
const CAPTIONS = resolve(__dirname, 'captions', `video-captions-${LANG}.srt`);
const FINAL = resolve(OUT, 'etsy-video-v1.mp4');

const W = 1080, H = 1920, FPS = 30;
const BG = '#0a0e12';      // matches teleprompter/shoot-card
const ACCENT = '#00ff88';

// Cross-platform font resolution. Order: Windows Arial → macOS Helvetica →
// common Linux DejaVu/Liberation → fc-match fallback → fail.
function resolveFont(preferBold) {
  const candidates = preferBold
    ? [
        'C:/Windows/Fonts/arialbd.ttf',
        '/Windows/Fonts/arialbd.ttf',
        '/System/Library/Fonts/Helvetica.ttc',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
        '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
      ]
    : [
        'C:/Windows/Fonts/arial.ttf',
        '/Windows/Fonts/arial.ttf',
        '/System/Library/Fonts/Helvetica.ttc',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
        '/usr/share/fonts/TTF/DejaVuSans.ttf',
      ];
  for (const p of candidates) { if (existsSync(p)) return p; }
  try {
    const q = preferBold ? 'sans:bold' : 'sans';
    const out = execSync(`fc-match -f "%{file}" ${q}`, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
    if (out && existsSync(out)) return out;
  } catch { /* fc-match absent */ }
  console.error('❌ No usable font found. Install DejaVu/Liberation, or add a path to resolveFont().');
  process.exit(1);
}

// 8-scene arc — durations sum to 60.0s
const SCENES = [
  { id: 1, dur: 3,  type: 'title',  text: 'Maqueen Lab',                   subtitle: 'Every component, live in your browser' },
  { id: 2, dur: 7,  type: 'image',  src: 'screenshot-controls.png', effect: 'zoom-in' },
  { id: 3, dur: 10, type: 'image',  src: 'screenshot-3d.png',       effect: 'pan-right' },
  { id: 4, dur: 10, type: 'image',  src: 'screenshot-motors.png',   effect: 'zoom-in' },
  { id: 5, dur: 10, type: 'image',  src: 'screenshot-graph.png',    effect: 'pan-left' },
  { id: 6, dur: 10, type: 'image',  src: 'screenshot-sensors.png',  effect: 'zoom-out' },
  { id: 7, dur: 5,  type: 'cta',    text: 'Full kit',                           subtitle: '' },
  { id: 8, dur: 5,  type: 'end',    text: 'Maqueen Lab',                   subtitle: '' },
];

// -------- helpers --------

function checkFfmpeg() {
  try { execSync('ffmpeg -version', { stdio: 'pipe' }); }
  catch {
    console.error('❌ ffmpeg not found on PATH.');
    console.error('   Install: winget install Gyan.FFmpeg  (Windows)');
    console.error('            brew install ffmpeg         (macOS)');
    console.error('            apt install ffmpeg          (Linux)');
    process.exit(1);
  }
}

function run(args, label) {
  console.log(`  · ${label}`);
  const r = spawnSync('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) {
    console.error(`❌ ffmpeg failed (${label}):`);
    console.error(r.stderr.toString().split('\n').slice(-20).join('\n'));
    process.exit(1);
  }
}

// Escape a path for ffmpeg's subtitles= filter (colons, backslashes, commas).
// On Windows this is notoriously fussy; forward slashes + escaped colon work.
function ffSubPath(p) {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:');
}

// Same escaping works for drawtext fontfile= on Windows. Linux paths pass through.
function ffFontPath(p) {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:');
}

// Escape special chars in drawtext text= values. Colons are option separators
// even inside single quotes, so they must be backslash-escaped. Also escape
// single quotes, backslashes, and commas.
function ffText(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,');
}

const BOLD_FONT = ffFontPath(resolveFont(true));
const REGULAR_FONT = ffFontPath(resolveFont(false));

// -------- scene builders --------

function sceneTitle(s, out) {
  const lines = s.text.replace(/\\n/g, '\n');
  const vf = [
    `color=c=${BG}:s=${W}x${H}:d=${s.dur}:r=${FPS}`,
    `drawtext=text='${ffText(lines.split('\n')[0])}':fontcolor=${ACCENT}:fontsize=130:` +
      `x=(w-text_w)/2:y=(h-text_h)/2-80:fontfile='${BOLD_FONT}'`,
    `drawtext=text='${ffText(lines.split('\n')[1] || '')}':fontcolor=white:fontsize=130:` +
      `x=(w-text_w)/2:y=(h-text_h)/2+80:fontfile='${BOLD_FONT}'`,
  ];
  run([
    '-y',
    '-f', 'lavfi', '-i', `color=c=${BG}:s=${W}x${H}:d=${s.dur}:r=${FPS}`,
    '-vf', vf.slice(1).join(','),
    '-t', String(s.dur),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-pix_fmt', 'yuv420p',
    out,
  ], `scene ${s.id} (title)`);
}

function sceneImage(s, out) {
  const src = join(SHOTS, s.src);
  if (!existsSync(src)) {
    // Back-compat fallback to legacy filename (e.g. screenshot-3d.png).
    const legacy = s.src.replace(/^pair-|-live|-active|-on|-tilted|-heart/g, '').replace(/^/, 'screenshot-').replace('screenshot-screenshot-', 'screenshot-');
    const alt = join(SHOTS, legacy);
    if (existsSync(alt)) { console.log(`  · fallback: ${legacy}`); return sceneImage({ ...s, src: legacy }, out); }
    console.error(`❌ missing screenshot: ${src}`); process.exit(1);
  }

  // zoompan requires input dimensions; we don't probe — let ffmpeg scale first.
  // Strategy: scale to fit 1080 width preserving AR, pad to 1920 height on BG,
  // then apply a slow zoom effect via zoompan.
  const frames = s.dur * FPS;
  // Subtle motion only: max ~1.05x zoom keeps the screenshot inside the
  // padded frame so it never collides with the bottom caption strip.
  let zoompan;
  switch (s.effect) {
    case 'zoom-in':
      zoompan = `zoompan=z='min(zoom+0.0003,1.05)':d=${frames}:s=${W}x${H}:fps=${FPS}`;
      break;
    case 'zoom-out':
      zoompan = `zoompan=z='if(lte(on,1),1.05,max(zoom-0.0003,1.0))':d=${frames}:s=${W}x${H}:fps=${FPS}`;
      break;
    case 'pan-right':
      zoompan = `zoompan=z=1.03:x='iw*0.05*on/${frames}':y='ih*0.02':d=${frames}:s=${W}x${H}:fps=${FPS}`;
      break;
    case 'pan-left':
      zoompan = `zoompan=z=1.03:x='iw*0.05*(1-on/${frames})':y='ih*0.02':d=${frames}:s=${W}x${H}:fps=${FPS}`;
      break;
    default:
      zoompan = `zoompan=z=1.02:d=${frames}:s=${W}x${H}:fps=${FPS}`;
  }

  // Fit-to-width (no crop): scale to 1080 wide preserving aspect, pad to
  // 1080x1920 on BG color. Landscape 3:2 app shot (2200x1500 → 1080x736)
  // sits in the vertical middle with room at top + bottom for titles and
  // captions. All app content preserved.
  const vf = [
    `scale=${W}:-1:force_original_aspect_ratio=decrease`,
    `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${BG.replace('#', '0x')}`,
    `format=yuv420p`,
    zoompan,
  ].join(',');

  run([
    '-y',
    '-loop', '1', '-framerate', String(FPS), '-i', src,
    '-vf', vf,
    '-t', String(s.dur),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-pix_fmt', 'yuv420p',
    out,
  ], `scene ${s.id} (${s.src})`);
}

function sceneCta(s, out) {
  const lines = s.text.replace(/\\n/g, '\n').split('\n');
  // SRT caption ("Link below — lifetime updates, teachers and kids welcome.")
  // burns at the bottom, so we keep just the hero title here. The arrow line
  // sits well below the SRT pill.
  const vf = [
    `drawtext=text='${ffText(lines[0])}':fontcolor=${ACCENT}:fontsize=160:` +
      `x=(w-text_w)/2:y=(h-text_h)/2-200:fontfile='${BOLD_FONT}'`,
    `drawtext=text='${ffText(lines[1] || '')}':fontcolor=white:fontsize=90:` +
      `x=(w-text_w)/2:y=(h-text_h)/2:fontfile='${REGULAR_FONT}'`,
  ].join(',');
  run([
    '-y',
    '-f', 'lavfi', '-i', `color=c=${BG}:s=${W}x${H}:d=${s.dur}:r=${FPS}`,
    '-vf', vf,
    '-t', String(s.dur),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-pix_fmt', 'yuv420p',
    out,
  ], `scene ${s.id} (cta)`);
}

function sceneEnd(s, out) {
  // Same as title but static — this becomes the loop frame. Keep identical to
  // scene 1 so Etsy's loop playback feels seamless.
  sceneTitle(s, out);
}

// -------- concat + caption burn --------

function concatAndCaption(sceneFiles) {
  const listFile = join(SCENES_DIR, 'concat.txt');
  writeFileSync(listFile, sceneFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n'));

  const midPath = join(SCENES_DIR, '_concat.mp4');
  run([
    '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-c', 'copy',
    midPath,
  ], 'concat scenes');

  // Burn SRT as hard subtitles, styled to match palette.
  // force_style: bottom-aligned, white on semi-transparent dark strip, larger font.
  // Discrete YouTube-style captions: smaller, more translucent, tighter.
  // FontSize=9 (~60px at 1920) keeps captions readable on phone without
  // dominating the frame. BackColour alpha A0 (= ~37% opacity) = subtle.
  const style = [
    'FontName=Arial',
    'FontSize=9',
    'PrimaryColour=&H00FFFFFF',
    'OutlineColour=&H00000000',
    'BackColour=&HA0000000',
    'BorderStyle=3',
    'Outline=2',
    'Shadow=0',
    'Alignment=2',
    'MarginV=60',
    'Bold=0',
  ].join(',');

  run([
    '-y', '-i', midPath,
    '-vf', `subtitles='${ffSubPath(CAPTIONS)}':force_style='${style}'`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    FINAL,
  ], 'burn captions + final encode');
}

// -------- main --------

function main() {
  checkFfmpeg();
  mkdirSync(OUT, { recursive: true });
  if (existsSync(SCENES_DIR)) rmSync(SCENES_DIR, { recursive: true, force: true });
  mkdirSync(SCENES_DIR, { recursive: true });

  if (!existsSync(CAPTIONS)) {
    console.error(`❌ captions missing: ${CAPTIONS}`);
    process.exit(1);
  }

  console.log(`\n🎬 Generating Etsy video v1 — ${W}x${H} @ ${FPS}fps, ${SCENES.reduce((a, s) => a + s.dur, 0)}s\n`);

  const sceneFiles = [];
  for (const s of SCENES) {
    const out = join(SCENES_DIR, `scene-${String(s.id).padStart(2, '0')}.mp4`);
    switch (s.type) {
      case 'title': sceneTitle(s, out); break;
      case 'image': sceneImage(s, out); break;
      case 'cta':   sceneCta(s, out); break;
      case 'end':   sceneEnd(s, out); break;
      default: throw new Error(`unknown scene type: ${s.type}`);
    }
    sceneFiles.push(out);
  }

  console.log('\n🔗 Concatenating + burning captions...\n');
  concatAndCaption(sceneFiles);

  console.log(`\n✅ ${FINAL}`);
  console.log('   Check: plays 9:16 · under 100 MB · captions readable · first frame loud\n');
}

main();
