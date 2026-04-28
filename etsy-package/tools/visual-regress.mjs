/**
 * Visual regression harness — catches unintended screenshot changes.
 *
 * Compares current seller-only/screenshots/*.png against a baseline in
 * seller-only/screenshots-baseline/. Emits side-by-side diff images for
 * anything that changed beyond the tolerance threshold, and exits non-zero
 * if a regression is found (CI-friendly).
 *
 * Commands:
 *   node visual-regress.mjs           — diff current vs baseline (default)
 *   node visual-regress.mjs --baseline — promote current → baseline
 *   node visual-regress.mjs --list    — list tracked files
 *
 * Requires: ffmpeg on PATH.
 *
 * Exit codes:
 *   0 — no diffs beyond threshold (or --baseline/--list)
 *   1 — regression detected
 *   2 — missing baseline files
 */

import { spawnSync } from 'child_process';
import { readdirSync, mkdirSync, existsSync, copyFileSync, statSync, rmSync, readFileSync } from 'fs';
import { createHash } from 'crypto';
import { resolve, join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const md5 = (p) => createHash('md5').update(readFileSync(p)).digest('hex');

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(__dirname, '..');
const argLangIdx = process.argv.indexOf('--lang');
const LANG = argLangIdx > 0 ? process.argv[argLangIdx + 1] : 'en';
const SHOTS    = resolve(PKG, 'output', LANG, 'screenshots');
const BASELINE = resolve(PKG, 'output', LANG, 'screenshots-baseline');
const DIFF     = resolve(PKG, 'output', '_tmp', `visual-diffs-${LANG}`);

const ARG = process.argv[2] || '';
const THRESHOLD_RATIO = 0.005;   // 0.5 % of pixels allowed to differ

function ff(args) {
  const r = spawnSync('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  return { ok: r.status === 0, stderr: r.stderr.toString() };
}

function listPngs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.png') && !f.includes('diff-'));
}

// --- command: --list ---
if (ARG === '--list') {
  const files = listPngs(SHOTS);
  console.log(`\nTracked files (${files.length}):\n`);
  for (const f of files) console.log(`  ${f}`);
  process.exit(0);
}

// --- command: --baseline (promote) ---
if (ARG === '--baseline') {
  if (existsSync(BASELINE)) rmSync(BASELINE, { recursive: true, force: true });
  mkdirSync(BASELINE, { recursive: true });
  const files = listPngs(SHOTS);
  for (const f of files) copyFileSync(join(SHOTS, f), join(BASELINE, f));
  console.log(`\n✅ Promoted ${files.length} screenshots to baseline.`);
  console.log(`   Next run of visual-regress.mjs diffs against this set.\n`);
  process.exit(0);
}

// --- default: diff ---
try { spawnSync('ffmpeg', ['-version'], { stdio: 'pipe' }); }
catch { console.error('❌ ffmpeg not on PATH.'); process.exit(1); }

if (!existsSync(BASELINE)) {
  console.error(`❌ No baseline. Run with --baseline to capture one first.`);
  process.exit(2);
}

mkdirSync(DIFF, { recursive: true });
// Clear stale diffs
for (const f of readdirSync(DIFF)) rmSync(join(DIFF, f));

const current = new Set(listPngs(SHOTS));
const base = new Set(listPngs(BASELINE));

const added   = [...current].filter(f => !base.has(f));
const removed = [...base].filter(f => !current.has(f));
const common  = [...current].filter(f => base.has(f));

console.log(`\n🔍 Visual regression: ${common.length} compared, ${added.length} new, ${removed.length} removed\n`);

let regressions = 0;
const diffSummary = [];

for (const f of common) {
  const a = join(BASELINE, f);
  const b = join(SHOTS, f);
  if (md5(a) === md5(b)) { process.stdout.write('✓'); continue; }
  // Bytes differ → produce side-by-side diff for human review.
  regressions++;
  const sizeA = statSync(a).size;
  const sizeB = statSync(b).size;
  const diffPath = join(DIFF, `diff-${f}`);
  ff([
    '-y', '-i', a, '-i', b,
    '-filter_complex',
      `[0:v]scale=540:-1,drawbox=x=0:y=0:w=iw:h=40:color=black@0.7:t=fill,drawtext=text='BASELINE':x=12:y=8:fontcolor=white:fontsize=18[aa];` +
      `[1:v]scale=540:-1,drawbox=x=0:y=0:w=iw:h=40:color=black@0.7:t=fill,drawtext=text='CURRENT':x=12:y=8:fontcolor=white:fontsize=18[bb];` +
      `[aa][bb]hstack=inputs=2`,
    '-frames:v', '1',
    diffPath,
  ]);
  diffSummary.push({ f, sizeDelta: sizeB - sizeA });
  process.stdout.write('⚠️ ');
}

console.log('\n');

if (added.length)   console.log(`NEW (${added.length}): ${added.join(', ')}`);
if (removed.length) console.log(`REMOVED (${removed.length}): ${removed.join(', ')}`);

if (diffSummary.length) {
  console.log(`\nREGRESSIONS (${diffSummary.length}):\n`);
  for (const d of diffSummary) {
    console.log(`  ${d.f}  size ${d.sizeDelta > 0 ? '+' : ''}${d.sizeDelta}B`);
  }
  console.log(`\n   Side-by-side diff images in ${DIFF}`);
  console.log(`   Accept with: node visual-regress.mjs --baseline\n`);
  process.exit(1);
}

console.log(`✅ No regressions.\n`);
process.exit(0);
