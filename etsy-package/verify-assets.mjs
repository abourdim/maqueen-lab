#!/usr/bin/env node
/**
 * verify-assets.mjs — pre-flight check BEFORE running the pipeline.
 *
 * Catches the class of failures that produce silently-broken output
 * (black hero images, empty embeds, missing screenshots) by validating
 * that every asset referenced in a spec file actually exists on disk.
 *
 * Run from a product root (same convention as verify-clean.mjs):
 *   node ../etsy-package-template/verify-assets.mjs
 *   node ../etsy-package-template/verify-assets.mjs --lang fr
 *
 * Exit code 0 = all referenced assets exist.
 * Exit code 1 = missing assets / broken refs.
 *
 * Checks:
 *   1. print-specs.json   `common.screenshots.*` + `screenshot`
 *   2. social-specs.json  `screenshot`
 *   3. hero-specs.json    every hero's `screenshots[]`
 *   4. capture-config.json tab selectors must have matching screenshots in output/<lang>/screenshots/
 *   5. Cross-language parity: if EN has screenshots, FR and AR must too (or flag as known gap)
 *   6. Chatbot embed.html non-empty (> 500 bytes)
 *   7. Identity HTML files non-empty
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const argLangIdx = process.argv.indexOf('--lang');
const ONLY_LANG = argLangIdx > 0 ? process.argv[argLangIdx + 1] : null;

const CWD = process.cwd();
const PKG = resolve(CWD, 'etsy-package');

if (!existsSync(PKG)) {
  console.error(`❌ No etsy-package/ in ${CWD}`);
  process.exit(1);
}

const TOOLS = join(PKG, 'tools');
const OUT = join(PKG, 'output');
const LANGS = ONLY_LANG ? [ONLY_LANG] : ['en', 'fr', 'ar'];

let errors = 0;
let warnings = 0;
const problems = [];

function err(msg) { problems.push({ level: 'ERR', msg }); errors++; }
function warn(msg) { problems.push({ level: 'WARN', msg }); warnings++; }
function ok(msg) { problems.push({ level: 'OK', msg }); }

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { err(`Cannot parse ${path}: ${e.message}`); return null; }
}

console.log(`\n🔎 verify-assets — ${CWD}`);
console.log(`   Checking langs: ${LANGS.join(', ')}\n`);

// ─────────────────────────────────────────────────────────────────────────
// 1. Screenshot references in specs must resolve to real files
// ─────────────────────────────────────────────────────────────────────────
function checkScreenshot(lang, filename, specSource) {
  const path = join(OUT, lang, 'screenshots', filename);
  if (!existsSync(path)) {
    err(`[${specSource}] references ${filename} — missing at output/${lang}/screenshots/`);
    return false;
  }
  return true;
}

const printSpecs = readJson(join(TOOLS, 'print-specs.json'));
if (printSpecs) {
  const screenshots = printSpecs.common?.screenshots || {};
  for (const [audience, filename] of Object.entries(screenshots)) {
    if (typeof filename !== 'string') continue;
    for (const lang of LANGS) {
      checkScreenshot(lang, filename, `print-specs.common.screenshots.${audience}`);
    }
  }
}

const socialSpecs = readJson(join(TOOLS, 'social-specs.json'));
if (socialSpecs?.screenshot) {
  for (const lang of LANGS) {
    checkScreenshot(lang, socialSpecs.screenshot, 'social-specs.screenshot');
  }
}

const heroSpecs = readJson(join(TOOLS, 'hero-specs.json'));
if (heroSpecs?.heroes) {
  for (const hero of heroSpecs.heroes) {
    const lang = hero.lang || 'en';
    if (ONLY_LANG && lang !== ONLY_LANG) continue;
    for (const shot of hero.screenshots || []) {
      checkScreenshot(lang, shot, `hero-specs.${hero.name}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Cross-language parity: if any lang has screenshots, all should
// ─────────────────────────────────────────────────────────────────────────
const shotCounts = {};
for (const lang of LANGS) {
  const dir = join(OUT, lang, 'screenshots');
  shotCounts[lang] = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.png')).length : 0;
}

const maxShots = Math.max(...Object.values(shotCounts));
if (maxShots > 0) {
  for (const [lang, count] of Object.entries(shotCounts)) {
    if (count === 0) {
      err(`lang=${lang} has 0 screenshots — other langs have ${maxShots}. Run: node etsy-package/tools/capture-screenshots.mjs --lang ${lang}`);
    } else if (count < maxShots / 2) {
      warn(`lang=${lang} has ${count} screenshots (other langs: up to ${maxShots}) — capture may be incomplete.`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 3. Generated HTML assets should not be empty
// ─────────────────────────────────────────────────────────────────────────
// Sizes reflect reality: embed.html is a script loader (~300B is fine);
// the heavy HTML lives in embed.js.
const sizeChecks = [
  { path: 'chatbot/embed.html', minBytes: 200,  label: 'chatbot embed snippet' },
  { path: 'chatbot/embed.js',   minBytes: 2000, label: 'chatbot widget JS' },
  { path: 'identity/business-card.html', minBytes: 1000, label: 'business card HTML' },
  { path: 'identity/email-signature.html', minBytes: 500, label: 'email signature HTML' },
  { path: 'print/poster-a3.html', minBytes: 1000, label: 'poster A3 HTML' },
  { path: 'print/flyer-a4.html', minBytes: 1000, label: 'flyer A4 HTML' },
  // PNG heuristic: a blown-up render of a missing screenshot still produces a PNG,
  // but one with a black rectangle. A completely broken render is <10KB.
  { path: 'print/poster-a3.png', minBytes: 50000, label: 'poster A3 PNG (broken render if small)' },
  { path: 'identity/business-card.png', minBytes: 20000, label: 'business card PNG' },
];
for (const lang of LANGS) {
  for (const check of sizeChecks) {
    const p = join(OUT, lang, check.path);
    if (!existsSync(p)) {
      // absence is a separate concern — only complain if the surrounding folder exists
      const folder = dirname(p);
      if (existsSync(folder)) warn(`[${lang}] ${check.label} missing at ${check.path}`);
      continue;
    }
    const sz = statSync(p).size;
    if (sz < check.minBytes) {
      err(`[${lang}] ${check.label} is ${sz}B (expected >${check.minBytes}B) at ${check.path} — generator likely produced empty output`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 4. Capture-config selectors must match live DOM (warning only —
//    we can't execute the app here, so just flag common anti-patterns)
// ─────────────────────────────────────────────────────────────────────────
const captureCfg = readJson(join(TOOLS, 'capture-config.json'));
if (captureCfg?._rewrite) {
  err(`capture-config.json still has _rewrite banner — rewrite selectors for this product before running capture-screenshots`);
}

// ─────────────────────────────────────────────────────────────────────────
// 5. Coverage report — every expected folder/file under output/<lang>/
// ─────────────────────────────────────────────────────────────────────────
// The full "bit-playground parity" manifest. A product with fewer features
// may legitimately omit some (e.g. datasets/stand/photoreal for a software-
// only product), but omission must be explicit via ALLOWED_MISSING in
// product.json — otherwise we warn.
const EXPECTED_PER_LANG = [
  { kind: 'dir',  path: 'screenshots',       tool: 'capture-screenshots.mjs --lang <L>' },
  { kind: 'dir',  path: 'heroes',            tool: 'hero-compose.mjs --lang <L>' },
  { kind: 'dir',  path: 'print',             tool: 'generate-print.mjs --lang <L>' },
  { kind: 'dir',  path: 'social',            tool: 'generate-social.mjs --lang <L>' },
  { kind: 'dir',  path: 'identity',          tool: 'generate-identity.mjs --lang <L>' },
  { kind: 'dir',  path: 'gifs',              tool: 'generate-gifs.mjs --lang <L>  (needs ffmpeg)' },
  { kind: 'dir',  path: 'speed-test',        tool: 'speed-test-clip.mjs --lang <L>  (needs ffmpeg)' },
  { kind: 'dir',  path: 'captions',          tool: 'generate-captions.mjs --lang <L>' },
  { kind: 'dir',  path: 'accessibility',     tool: 'generate-accessibility.mjs --lang <L>' },
  { kind: 'dir',  path: 'chatbot',           tool: 'chatbot-embed.mjs --lang <L>' },
  { kind: 'dir',  path: 'narrated',          tool: 'narrate-video.mjs <L>  (needs ffmpeg + SAPI)' },
  { kind: 'file', path: 'etsy-video-v1.mp4', tool: 'generate-video.mjs --lang <L>  (needs ffmpeg)' },
  { kind: 'file', path: 'theme-morph.gif',   tool: 'theme-morph.mjs --lang <L>  (needs ffmpeg + themes in capture-config)',  optional: true },
  { kind: 'file', path: 'theme-morph.mp4',   tool: 'theme-morph.mjs --lang <L>',                                              optional: true },
];

const EXPECTED_SHARED = [
  { kind: 'dir',  path: 'mockups',             tool: 'build-package.js' },
  { kind: 'dir',  path: 'printable-renders',   tool: 'build-package.js' },
  { kind: 'dir',  path: 'pinterest-pins',      tool: 'build-package.js' },
  { kind: 'dir',  path: 'ble-dialog',          tool: 'fake-ble-dialog.mjs' },
  { kind: 'dir',  path: 'photoreal',           tool: 'photoreal-board.mjs hero',  optional: true, note: 'skip for software-only products' },
  { kind: 'dir',  path: 'printables-with-qr',  tool: 'qr-inject.mjs --preview' },
  { kind: 'dir',  path: 'stand',               tool: 'generate-stand-svg.mjs',    optional: true, note: 'skip for software-only products' },
  { kind: 'dir',  path: 'datasets',            tool: 'generate-datasets.mjs 100', optional: true, note: 'skip for products without a sensor-CSV use case' },
  { kind: 'file', path: 'video-shoot-card.png',tool: 'build-package.js' },
];

const productJson = readJson(resolve(CWD, 'product.json')) || {};
const ALLOWED_MISSING = new Set(productJson.ALLOWED_MISSING || []);

console.log('\n📋 Coverage report vs full-pipeline manifest:\n');

for (const lang of LANGS) {
  const langDir = join(OUT, lang);
  if (!existsSync(langDir)) { err(`output/${lang}/ does not exist — run build-localized.mjs ${lang}`); continue; }
  const missing = [];
  const present = [];
  for (const item of EXPECTED_PER_LANG) {
    const p = join(langDir, item.path);
    const ok = existsSync(p) && (item.kind === 'file' ? statSync(p).size > 1000 : readdirSync(p).length > 0);
    if (ok) { present.push(item.path); continue; }
    if (item.optional || ALLOWED_MISSING.has(`${lang}/${item.path}`)) continue;
    missing.push(item);
  }
  console.log(`  [${lang}] ${present.length}/${EXPECTED_PER_LANG.filter(x => !x.optional).length} required present`);
  for (const m of missing) {
    warn(`[${lang}] missing ${m.path} — run: ${m.tool.replace('<L>', lang)}`);
  }
}

{
  const sharedDir = join(OUT, 'shared');
  const missing = [];
  const present = [];
  for (const item of EXPECTED_SHARED) {
    const p = join(sharedDir, item.path);
    const ok = existsSync(p) && (item.kind === 'file' ? statSync(p).size > 100 : readdirSync(p).length > 0);
    if (ok) { present.push(item.path); continue; }
    if (item.optional || ALLOWED_MISSING.has(`shared/${item.path}`)) continue;
    missing.push(item);
  }
  console.log(`  [shared] ${present.length}/${EXPECTED_SHARED.filter(x => !x.optional).length} required present`);
  for (const m of missing) {
    warn(`[shared] missing ${m.path} — run: ${m.tool}${m.note ? '  (or add to ALLOWED_MISSING: "shared/' + m.path + '")' : ''}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────
for (const p of problems) {
  const icon = p.level === 'ERR' ? '❌' : p.level === 'WARN' ? '⚠️ ' : '✓';
  console.log(`  ${icon} ${p.msg}`);
}

console.log('');
if (errors === 0 && warnings === 0) {
  console.log('✅ All referenced assets exist and are non-empty.\n');
  process.exit(0);
}
console.log(`${errors} error(s), ${warnings} warning(s).\n`);
if (errors > 0) {
  console.log('💡 Fix errors before running the full marketing pipeline —');
  console.log('   generated posters/heroes/social will silently use missing images otherwise.\n');
}
process.exit(errors > 0 ? 1 : 0);
